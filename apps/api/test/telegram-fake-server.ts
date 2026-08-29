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
  body: Record<string, unknown>;
  /** Token extraido da URL, para provar que ele nunca vaza para log/resposta. */
  token: string;
}

/**
 * Servidor que responde como a Bot API oficial do Telegram.
 *
 * Mantem a suite deterministica e offline, mas exercita de verdade o fetch,
 * timeout, retry, parsing e classificacao de erros do client.
 */
export class TelegramFakeServer {
  private server?: Server;
  private port = 0;
  private nextMessageId = 1000;
  private overrides: { method: string; override: Override }[] = [];

  readonly calls: ReceivedCall[] = [];

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
    this.nextMessageId = 1000;
  }

  /** Força uma resposta para um metodo da Bot API. */
  failOn(method: string, override: Partial<Override> & { status: number }): void {
    this.overrides.push({ method, override: { remaining: Infinity, ...override } });
  }

  /** Resposta de erro no formato oficial: 200/4xx com ok:false e description. */
  failWithDescription(method: string, status: number, description: string, extra?: object): void {
    this.failOn(method, {
      status,
      body: { ok: false, error_code: status, description, ...extra },
    });
  }

  callsTo(method: string): ReceivedCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const match = /^\/bot([^/]+)\/(\w+)$/.exec(req.url ?? '');

    if (!match) return json(res, 404, { ok: false, description: 'Not Found' });

    const [, token, method] = match;
    const body = await readJson(req);

    this.calls.push({ method, body, token });

    const override = this.matchOverride(method);
    if (override) {
      if (override.delayMs) await sleep(override.delayMs);
      return json(res, override.status, override.body ?? { ok: false, description: 'forced' });
    }

    if (method === 'getChat') {
      return json(res, 200, {
        ok: true,
        result: { id: -1001234567890, title: 'Ofertas Brasil', username: 'ofertas_brasil' },
      });
    }

    if (method === 'sendMessage' || method === 'sendPhoto') {
      this.nextMessageId += 1;
      return json(res, 200, { ok: true, result: { message_id: this.nextMessageId } });
    }

    return json(res, 400, { ok: false, description: 'Method not supported' });
  }

  private matchOverride(method: string): Override | undefined {
    const entry = this.overrides.find(
      (candidate) => candidate.method === method && candidate.override.remaining > 0,
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
