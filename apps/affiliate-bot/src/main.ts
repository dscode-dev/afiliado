import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { AffiliateConsole } from './affiliate-console';
import { config } from './config';
import { AffiliateBotError, BotStatus, GeneratedLink, StatusResponse } from './types';

/**
 * affiliate-bot: processo separado, com a unica responsabilidade de gerar
 * links de afiliado a partir de uma sessao real da Central.
 *
 * Fica separado da API de proposito: se ele cair, o Garimpo continua
 * sincronizando, avaliando e publicando com os links que ja existem - so
 * deixam de surgir links novos.
 */
const console_ = new AffiliateConsole();

async function status(): Promise<StatusResponse> {
  try {
    await console_.open();
    const tag = await console_.activeTag();

    return { status: 'READY', tag };
  } catch (error) {
    if (error instanceof AffiliateBotError) {
      const status: BotStatus = error.failure === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'UNAVAILABLE';
      return { status, tag: null, detail: error.failure };
    }

    // Sem este log o operador so ve `unexpected_error` no /health e nao tem
    // como descobrir a causa. A mensagem do Playwright nao carrega segredo.
    logError('status', error);

    return { status: 'UNAVAILABLE', tag: null, detail: 'unexpected_error' };
  }
}

/** Log estruturado de falha. Nunca inclui perfil, cookies ou segredo. */
function logError(operation: string, error: unknown): void {
  process.stderr.write(
    JSON.stringify({
      event: 'affiliate_bot_error',
      operation,
      message: error instanceof Error ? error.message.split('\n')[0] : String(error),
    }) + '\n',
  );
}

async function generate(url: string): Promise<GeneratedLink> {
  await console_.open();

  return console_.generate(url);
}

function authorized(request: IncomingMessage): boolean {
  if (!config.sharedSecret) return true;

  const provided = request.headers['x-bot-secret'];
  if (typeof provided !== 'string') return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(config.sharedSecret);

  return a.length === b.length && timingSafeEqual(a, b);
}

function json(response: ServerResponse, code: number, body: unknown): void {
  response.writeHead(code, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}') as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? '/', `http://localhost:${config.port}`);

    if (url.pathname === '/health') {
      return json(response, 200, { status: 'ok' });
    }

    if (!authorized(request)) {
      return json(response, 401, { error: 'unauthorized' });
    }

    try {
      if (request.method === 'GET' && url.pathname === '/status') {
        return json(response, 200, await status());
      }

      if (request.method === 'POST' && url.pathname === '/links') {
        const body = await readBody(request);
        const target = typeof body.url === 'string' ? body.url : '';

        if (!target.startsWith('https://')) {
          return json(response, 400, { failure: 'INVALID_RESPONSE', message: 'url invalida' });
        }

        return json(response, 200, await generate(target));
      }

      return json(response, 404, { error: 'not_found' });
    } catch (error) {
      if (error instanceof AffiliateBotError) {
        // AUTH_REQUIRED e 409: nao e erro do chamador nem do servidor, e
        // "um humano precisa autenticar uma vez".
        const code =
          error.failure === 'AUTH_REQUIRED' ? 409 : error.failure === 'RATE_LIMITED' ? 429 : 502;

        return json(response, code, { failure: error.failure, message: error.message });
      }

      logError(`${request.method} ${url.pathname}`, error);

      return json(response, 502, { failure: 'UNAVAILABLE', message: 'Erro inesperado' });
    }
  })();
});

server.listen(config.port, () => {
  // Nunca logamos o perfil completo nem o segredo compartilhado.
  process.stdout.write(
    JSON.stringify({
      event: 'affiliate_bot_started',
      port: config.port,
      headless: config.headless,
      profileConfigured: Boolean(config.profilePath),
    }) + '\n',
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void console_.close().finally(() => {
      server.close(() => process.exit(0));
    });
  });
}
