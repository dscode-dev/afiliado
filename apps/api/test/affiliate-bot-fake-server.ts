import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';

interface Override {
  status: number;
  body?: unknown;
  delayMs?: number;
  remaining: number;
}

export interface ReceivedCall {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

/**
 * Servidor que responde como o affiliate-bot.
 *
 * Mantem a suite offline e deterministica: nenhum teste depende da conta real
 * do Mercado Livre nem sobe browser.
 */
export class AffiliateBotFakeServer {
  private server?: Server;
  private port = 0;
  private overrides: { path: string; override: Override }[] = [];
  private nextId = 1;

  readonly calls: ReceivedCall[] = [];
  /** Tag devolvida pelo `/status`. Null simula sessao sem tag utilizavel. */
  tag: string | null = 'GARIMPO01';
  status: 'READY' | 'AUTH_REQUIRED' | 'UNAVAILABLE' = 'READY';
  /** Link devolvido. Quando null, gera um curto e valido automaticamente. */
  linkUrl: string | null = null;
  originUrl: string | null = null;
  responseTag: string | null = null;

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    this.server.keepAliveTimeout = 0;
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    this.port = (this.server!.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
  }

  reset(): void {
    this.calls.length = 0;
    this.overrides = [];
    this.tag = 'GARIMPO01';
    this.status = 'READY';
    this.linkUrl = null;
    this.originUrl = null;
    this.responseTag = null;
    this.nextId = 1;
  }

  failOn(path: string, override: Partial<Override> & { status: number }): void {
    this.overrides.push({ path, override: { remaining: Infinity, ...override } });
  }

  callsTo(path: string): ReceivedCall[] {
    return this.calls.filter((call) => call.path === path);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? '/').split('?')[0];
    const body = await readJson(req);

    this.calls.push({ method: req.method ?? 'GET', path, body });

    const override = this.matchOverride(path);
    if (override) {
      if (override.delayMs) await sleep(override.delayMs);
      return json(res, override.status, override.body ?? { failure: 'UNAVAILABLE' });
    }

    if (path === '/status') {
      return json(res, 200, {
        status: this.status,
        tag: this.status === 'READY' ? this.tag : null,
      });
    }

    if (path === '/links') {
      const target = String(body.url ?? '');
      this.nextId += 1;

      return json(res, 200, {
        url: this.linkUrl ?? `https://mercadolivre.com/sec/GRM${this.nextId}`,
        originUrl: this.originUrl ?? target,
        tag: this.responseTag ?? this.tag,
      });
    }

    return json(res, 404, { error: 'not_found' });
  }

  private matchOverride(path: string): Override | undefined {
    const entry = this.overrides.find(
      (candidate) => candidate.path === path && candidate.override.remaining > 0,
    );

    if (!entry) return undefined;

    entry.override.remaining -= 1;
    return entry.override;
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}') as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
