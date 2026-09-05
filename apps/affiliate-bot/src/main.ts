import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { statSync } from 'node:fs';
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

/**
 * Cache do /status, com TTL por resultado.
 *
 * O /health da API consulta este endpoint, e o healthcheck do Docker chama o
 * /health a cada 10 segundos. Sem cache, cada um desses vira uma requisicao ao
 * endpoint de tags da Central -- ~360 por hora, indefinidamente, e o Mercado
 * Livre passa a barrar a conta por excesso de tentativas.
 *
 * O TTL de falha e propositalmente LONGO: sessao expirada nao se conserta
 * sozinha. So um login humano resolve, entao reconsultar de minuto em minuto
 * nao descobre nada e ainda queima reputacao do IP.
 */
const STATUS_TTL_MS: Record<BotStatus, number> = {
  READY: 60_000,
  AUTH_REQUIRED: 15 * 60_000,
  UNAVAILABLE: 5 * 60_000,
};

let cachedStatus: { value: StatusResponse; expiresAt: number } | null = null;
let sessionFingerprint = sessionStamp();

/**
 * Assinatura do arquivo de sessao (mtime + tamanho).
 *
 * O login roda em OUTRO processo -- na maquina do operador, fora do container.
 * Ele nao tem como invalidar cache nem reiniciar nada aqui; o unico sinal que
 * atravessa essa fronteira e o proprio arquivo mudando no bind mount.
 */
function sessionStamp(): string {
  try {
    const info = statSync(config.sessionStatePath);
    return `${info.mtimeMs}:${info.size}`;
  } catch {
    return 'absent';
  }
}

/**
 * Descarta o estado quando a sessao no disco muda.
 *
 * Sem isto, um login novo nao teria efeito ate o TTL vencer -- e pior, o
 * contexto do browser continuaria carregado com os cookies ANTIGOS, entao nem
 * a expiracao do cache resolveria: ele revalidaria a sessao velha.
 */
async function syncWithSessionFile(): Promise<void> {
  const current = sessionStamp();
  if (current === sessionFingerprint) return;

  sessionFingerprint = current;
  cachedStatus = null;
  await console_.close();

  process.stdout.write(
    JSON.stringify({ event: 'affiliate_session_reloaded', source: 'session_file_changed' }) + '\n',
  );
}

async function status(): Promise<StatusResponse> {
  await syncWithSessionFile();

  if (cachedStatus && cachedStatus.expiresAt > Date.now()) {
    return cachedStatus.value;
  }

  const value = await resolveStatus();
  cachedStatus = { value, expiresAt: Date.now() + STATUS_TTL_MS[value.status] };

  return value;
}

async function resolveStatus(): Promise<StatusResponse> {
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
  await syncWithSessionFile();
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
