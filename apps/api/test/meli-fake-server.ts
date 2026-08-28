import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

interface Override {
  status: number;
  delayMs?: number;
  /** Quantas respostas ainda usarao este override. `Infinity` = sempre. */
  remaining: number;
  body?: unknown;
}

export interface FakeItem {
  id: string;
  site_id?: string;
  title?: string;
  category_id?: string;
  currency_id?: string;
  permalink?: string;
  seller_id?: number;
  status?: string;
  thumbnail?: string;
  secure_thumbnail?: string;
  pictures?: { secure_url?: string; url?: string }[];
  price?: number;
}

/**
 * Servidor HTTP que responde como a API oficial do Mercado Livre.
 *
 * Deixa a suite deterministica sem depender da disponibilidade real do provider,
 * e ainda assim exercita o codigo de fetch, timeout, retry e parsing de verdade.
 */
export class MeliFakeServer {
  private server?: Server;
  private port = 0;

  readonly items = new Map<string, FakeItem>();
  readonly prices = new Map<string, unknown>();
  readonly categories = new Map<string, { id: string; name: string }>();
  readonly highlights = new Map<string, { id: string; position: number; type: string }[]>();
  readonly catalogProducts = new Map<string, unknown>();

  /** Overrides por prefixo de caminho, aplicados na ordem de insercao. */
  private overrides: { match: string; override: Override }[] = [];
  readonly requests: string[] = [];
  tokenRequests = 0;
  private tokenStatus = 200;

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));

    // Sem keep-alive: cada arquivo de teste sobe um servidor novo em porta
    // efemera, e o SO reaproveita portas recem-liberadas. Um socket ocioso no
    // pool do `fetch` apontando para a porta anterior tornaria a suite instavel.
    this.server.keepAliveTimeout = 0;

    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.port = (this.server!.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    // `fetch` mantem sockets keep-alive; sem fechar as conexoes o `close`
    // ficaria pendurado e o Jest terminaria com handles abertos.
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
  }

  reset(): void {
    this.items.clear();
    this.prices.clear();
    this.categories.clear();
    this.highlights.clear();
    this.catalogProducts.clear();
    this.overrides = [];
    this.requests.length = 0;
    this.tokenRequests = 0;
    this.tokenStatus = 200;
  }

  /** Força uma resposta para todo caminho que comece com `match`. */
  failOn(match: string, override: Partial<Override> & { status: number }): void {
    this.overrides.push({
      match,
      override: { remaining: Infinity, ...override },
    });
  }

  failTokenWith(status: number): void {
    this.tokenStatus = status;
  }

  /** Registra item + preco de uma vez, no formato oficial. */
  seedItem(item: FakeItem, price: { amount: number; regular?: number | null }): void {
    this.items.set(item.id, { site_id: 'MLB', status: 'active', ...item });
    this.prices.set(item.id, {
      item_id: item.id,
      prices: [
        {
          type: 'standard',
          amount: price.amount,
          regular_amount: price.regular ?? null,
          currency_id: 'BRL',
          conditions: { start_time: null, end_time: null },
        },
      ],
    });
  }

  countRequests(match: string): number {
    return this.requests.filter((path) => path.startsWith(match)).length;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.baseUrl);
    const path = url.pathname;

    if (req.method === 'POST' && path === '/oauth/token') {
      this.tokenRequests += 1;
      await drain(req);

      if (this.tokenStatus !== 200) {
        return json(res, this.tokenStatus, { error: 'invalid_client', status: this.tokenStatus });
      }

      return json(res, 200, { access_token: 'fake-access-token', expires_in: 21600 });
    }

    this.requests.push(path + url.search);

    const override = this.matchOverride(path);
    if (override) {
      if (override.delayMs) await sleep(override.delayMs);
      return json(res, override.status, override.body ?? { message: 'forced', status: override.status });
    }

    // GET /items?ids=a,b  (multiget)
    if (path === '/items' && url.searchParams.has('ids')) {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
      return json(
        res,
        200,
        ids.map((id) => {
          const item = this.items.get(id);
          return item ? { code: 200, body: item } : { code: 404, body: { message: 'not found' } };
        }),
      );
    }

    const prices = /^\/items\/([^/]+)\/prices$/.exec(path);
    if (prices) {
      const payload = this.prices.get(prices[1]);
      return payload ? json(res, 200, payload) : json(res, 404, notFound());
    }

    const item = /^\/items\/([^/]+)$/.exec(path);
    if (item) {
      const payload = this.items.get(item[1]);
      return payload ? json(res, 200, payload) : json(res, 404, notFound());
    }

    const category = /^\/categories\/([^/]+)$/.exec(path);
    if (category) {
      const payload = this.categories.get(category[1]);
      return payload ? json(res, 200, payload) : json(res, 404, notFound());
    }

    const highlight = /^\/highlights\/([^/]+)\/category\/([^/]+)$/.exec(path);
    if (highlight) {
      const content = this.highlights.get(highlight[2]);
      return content ? json(res, 200, { content }) : json(res, 404, notFound());
    }

    const product = /^\/products\/([^/]+)$/.exec(path);
    if (product) {
      const payload = this.catalogProducts.get(product[1]);
      return payload ? json(res, 200, payload) : json(res, 404, notFound());
    }

    return json(res, 404, notFound());
  }

  private matchOverride(path: string): Override | undefined {
    const entry = this.overrides.find(
      (candidate) => path.startsWith(candidate.match) && candidate.override.remaining > 0,
    );

    if (!entry) return undefined;

    entry.override.remaining -= 1;
    return entry.override;
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' });
  res.end(payload);
}

function notFound(): unknown {
  return { message: 'Item not found', error: 'not_found', status: 404 };
}

function drain(req: IncomingMessage): Promise<void> {
  return new Promise((resolve) => {
    req.on('data', () => undefined);
    req.on('end', () => resolve());
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
