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
  /** Nó da Graph API chamado, ex.: "123456/photos". */
  node: string;
  params: Record<string, string>;
  /** Token visto pelo servidor, para provar que nunca vaza para log/resposta. */
  token: string | null;
}

/**
 * Servidor que responde como a Graph API oficial da Meta.
 *
 * Mantem a suite deterministica e offline, mas exercita de verdade o fetch,
 * timeout, retry, parsing e classificacao de erros do client.
 */
export class FacebookFakeServer {
  private server?: Server;
  private port = 0;
  private nextPostId = 900;
  private overrides: { match: string; override: Override }[] = [];

  readonly calls: ReceivedCall[] = [];
  readonly pages = new Map<string, { id: string; name: string }>();

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
    this.pages.clear();
    this.nextPostId = 900;
  }

  /** Força uma resposta para todo nó cujo caminho contenha `match`. */
  failOn(match: string, override: Partial<Override> & { status: number }): void {
    this.overrides.push({ match, override: { remaining: Infinity, ...override } });
  }

  /** Erro no formato oficial da Graph API. */
  failWithGraphError(
    match: string,
    status: number,
    error: { message: string; code: number; error_subcode?: number; type?: string },
  ): void {
    this.failOn(match, {
      status,
      body: { error: { type: 'OAuthException', fbtrace_id: 'AX-test', ...error } },
    });
  }

  callsTo(match: string): ReceivedCall[] {
    return this.calls.filter((call) => call.node.includes(match));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.baseUrl);
    // Caminho no formato /v21.0/{node}
    const node = url.pathname.replace(/^\/v\d+\.\d+\//, '');
    const raw = await readBody(req);
    const params = Object.fromEntries(new URLSearchParams(raw));
    const queryToken = url.searchParams.get('access_token');

    this.calls.push({
      method: req.method ?? 'GET',
      node,
      params,
      token: params.access_token ?? queryToken,
    });

    const override = this.matchOverride(node);
    if (override) {
      if (override.delayMs) await sleep(override.delayMs);
      return json(
        res,
        override.status,
        override.body ?? { error: { message: 'forced', code: 1, type: 'OAuthException' } },
      );
    }

    if (node.endsWith('/photos')) {
      this.nextPostId += 1;
      const pageId = node.split('/')[0];
      return json(res, 200, {
        id: String(this.nextPostId),
        post_id: `${pageId}_${this.nextPostId}`,
      });
    }

    if (node.endsWith('/feed')) {
      this.nextPostId += 1;
      const pageId = node.split('/')[0];
      return json(res, 200, { id: `${pageId}_${this.nextPostId}` });
    }

    // GET /{page-id}
    const page = this.pages.get(node);
    return page
      ? json(res, 200, page)
      : json(res, 400, {
          error: { message: 'Unsupported get request. Object does not exist', code: 803 },
        });
  }

  private matchOverride(node: string): Override | undefined {
    const entry = this.overrides.find(
      (candidate) => node.includes(candidate.match) && candidate.override.remaining > 0,
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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
