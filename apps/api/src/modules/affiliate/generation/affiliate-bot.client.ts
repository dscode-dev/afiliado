import { Injectable, Logger } from '@nestjs/common';

export type BotStatus = 'READY' | 'AUTH_REQUIRED' | 'UNAVAILABLE';

export type GenerationFailure =
  | 'AUTH_REQUIRED'
  | 'NO_ACTIVE_TAG'
  | 'AMBIGUOUS_TAG'
  | 'INVALID_RESPONSE'
  | 'INVALID_LINK'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'TIMEOUT';

export class AffiliateGenerationError extends Error {
  constructor(
    readonly failure: GenerationFailure,
    message: string,
  ) {
    super(message);
    this.name = 'AffiliateGenerationError';
  }
}

export interface BotStatusResponse {
  status: BotStatus;
  tag: string | null;
  detail?: string;
}

export interface BotGeneratedLink {
  url: string;
  originUrl: string;
  tag: string;
}

/** Falhas em que repetir e seguro: o bot respondeu que nao conseguiu agora. */
function isTransient(failure: GenerationFailure): boolean {
  return failure === 'UNAVAILABLE' || failure === 'TIMEOUT';
}

const MAX_ATTEMPTS = 2;

/**
 * Cliente do affiliate-bot.
 *
 * O bot e um processo separado que mantem a sessao da Central de Afiliados.
 * Se ele estiver fora do ar, a geracao falha - e o Garimpo simplesmente nao
 * publica aquele produto. Nunca cai para o permalink comum.
 */
@Injectable()
export class AffiliateBotClient {
  private readonly logger = new Logger(AffiliateBotClient.name);
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.baseUrl = (env.AFFILIATE_BOT_URL ?? 'http://localhost:3400').replace(/\/+$/, '');
    this.secret = env.AFFILIATE_BOT_SECRET ?? '';
    this.timeoutMs = Number(env.AFFILIATE_BOT_TIMEOUT_MS ?? 45000);
  }

  async status(): Promise<BotStatusResponse> {
    try {
      const { body } = await this.call<BotStatusResponse>('GET', '/status');

      return body;
    } catch (error) {
      const detail = error instanceof AffiliateGenerationError ? error.failure : 'UNAVAILABLE';

      return { status: detail === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'UNAVAILABLE', tag: null, detail };
    }
  }

  /** Gera o link. Repete no maximo uma vez, so em falha transitoria. */
  async generate(productUrl: string): Promise<BotGeneratedLink> {
    let lastError: AffiliateGenerationError | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const { body } = await this.call<BotGeneratedLink>('POST', '/links', { url: productUrl });

        return body;
      } catch (error) {
        if (!(error instanceof AffiliateGenerationError) || !isTransient(error.failure)) {
          throw error;
        }

        lastError = error;
        if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    throw lastError;
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{ body: T }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.secret ? { 'x-bot-secret': this.secret } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch (error) {
      const failure: GenerationFailure = controller.signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE';
      this.fail(failure, 'affiliate-bot inacessivel', error);
    } finally {
      clearTimeout(timer);
    }

    const payload = (await response.json().catch(() => ({}))) as T & {
      failure?: GenerationFailure;
      message?: string;
    };

    if (!response.ok) {
      this.fail(
        payload.failure ?? (response.status === 401 ? 'AUTH_REQUIRED' : 'UNAVAILABLE'),
        payload.message ?? `affiliate-bot respondeu ${response.status}`,
      );
    }

    return { body: payload };
  }

  private fail(failure: GenerationFailure, message: string, cause?: unknown): never {
    // Sem URL completa, sem segredo, sem cookie: apenas a causa.
    this.logger.error(
      JSON.stringify({ provider: 'affiliate_bot', failure }),
      cause instanceof Error ? cause.name : undefined,
    );

    throw new AffiliateGenerationError(failure, message);
  }
}
