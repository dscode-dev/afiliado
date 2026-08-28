import { Injectable, Logger } from '@nestjs/common';
import { MercadoLivreConfig } from './mercado-livre.config';
import { MercadoLivreError } from './mercado-livre.errors';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/** Renova o token um pouco antes de expirar, evitando corrida com o relogio. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * Obtem e mantem o access token do Mercado Livre em memoria.
 *
 * Nao ha persistencia: o token vive apenas no processo e some quando ele morre.
 * Isso evita guardar credencial em texto puro no banco e mantem o PR sem IAM.
 */
@Injectable()
export class MercadoLivreTokenService {
  private readonly logger = new Logger(MercadoLivreTokenService.name);
  private cached: CachedToken | null = null;
  /** Single-flight: chamadas concorrentes compartilham a mesma renovacao. */
  private inFlight: Promise<string> | null = null;

  constructor(private readonly config: MercadoLivreConfig) {}

  async getAccessToken(): Promise<string> {
    if (!this.config.isConfigured) {
      throw new MercadoLivreError('unauthorized', 'get_access_token');
    }

    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.accessToken;
    }

    this.inFlight ??= this.requestToken().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  /** Descarta o token em cache; usado quando o provider responde 401. */
  invalidate(): void {
    this.cached = null;
  }

  private async requestToken(): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.config.apiBaseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: this.config.tokenRequestBody(),
        signal: controller.signal,
      });
    } catch (error) {
      const failure = controller.signal.aborted ? 'timeout' : 'unavailable';
      this.logger.error(
        JSON.stringify({
          provider: 'mercado_livre',
          operation: 'get_access_token',
          failure,
          grant: this.config.grant,
        }),
        error instanceof Error ? error.message : undefined,
      );
      throw new MercadoLivreError(failure, 'get_access_token');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // 400 aqui e credencial/refresh token invalido, nao erro do chamador.
      const failure = response.status === 429 ? 'rate_limited' : 'unauthorized';
      this.logger.error(
        JSON.stringify({
          provider: 'mercado_livre',
          operation: 'get_access_token',
          failure,
          grant: this.config.grant,
          upstreamStatus: response.status,
        }),
      );
      throw new MercadoLivreError(failure, 'get_access_token', undefined, response.status);
    }

    const payload = (await response.json().catch(() => ({}))) as TokenResponse;

    if (!payload.access_token) {
      throw new MercadoLivreError('unauthorized', 'get_access_token', undefined, response.status);
    }

    const ttlMs = (payload.expires_in ?? 21600) * 1000;
    this.cached = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + Math.max(ttlMs - EXPIRY_MARGIN_MS, 1000),
    };

    // Nunca logamos o token, apenas o fato da renovacao e sua validade.
    this.logger.log(
      JSON.stringify({
        provider: 'mercado_livre',
        operation: 'get_access_token',
        grant: this.config.grant,
        expiresInSeconds: payload.expires_in ?? 21600,
      }),
    );

    return this.cached.accessToken;
  }
}
