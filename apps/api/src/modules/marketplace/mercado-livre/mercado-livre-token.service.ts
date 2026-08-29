import { Injectable, Logger } from '@nestjs/common';
import { MercadoLivreConfig } from './mercado-livre.config';
import { MercadoLivreCredentialStore } from './credential.store';
import { MercadoLivreError } from './mercado-livre.errors';

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
  scope?: string;
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

  constructor(
    private readonly config: MercadoLivreConfig,
    private readonly credentials: MercadoLivreCredentialStore,
  ) {}

  /**
   * Troca o `code` do Authorization Code por tokens e persiste o refresh.
   * Chamado apenas pelo callback do OAuth.
   */
  async exchangeAuthorizationCode(code: string): Promise<{ externalUserId: string | null }> {
    const payload = await this.requestTokenWith(
      this.config.authorizationCodeBody(code),
      'exchange_authorization_code',
    );

    if (!payload.refresh_token) {
      throw new MercadoLivreError('unauthorized', 'exchange_authorization_code');
    }

    const externalUserId = payload.user_id === undefined ? null : String(payload.user_id);
    await this.credentials.save(payload.refresh_token, externalUserId ?? undefined, payload.scope);

    this.cacheAccessToken(payload);

    return { externalUserId };
  }

  /** Ha credencial de usuario autorizada e utilizavel? */
  async hasUserCredential(): Promise<boolean> {
    return (await this.credentials.read()) !== null;
  }

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

  /**
   * Obtem um access token.
   *
   * Prefere a credencial de usuario (Authorization Code): o Mercado Livre so
   * libera itens, precos, highlights e vendedores com contexto de usuario -
   * `client_credentials` alcanca apenas categorias. O refresh token e
   * rotativo, entao o novo valor devolvido e persistido a cada renovacao.
   */
  private async requestToken(): Promise<string> {
    const stored = await this.credentials.read();

    if (stored) {
      const payload = await this.requestTokenWith(
        this.config.refreshBody(stored.refreshToken),
        'refresh_access_token',
      );

      if (payload.refresh_token && payload.refresh_token !== stored.refreshToken) {
        await this.credentials.save(
          payload.refresh_token,
          stored.externalUserId ?? undefined,
          payload.scope,
        );
      }

      return this.cacheAccessToken(payload);
    }

    return this.cacheAccessToken(
      await this.requestTokenWith(this.config.tokenRequestBody(), 'get_access_token'),
    );
  }

  private cacheAccessToken(payload: TokenResponse): string {
    const ttlMs = (payload.expires_in ?? 21600) * 1000;

    this.cached = {
      accessToken: payload.access_token as string,
      expiresAt: Date.now() + Math.max(ttlMs - EXPIRY_MARGIN_MS, 1000),
    };

    return this.cached.accessToken;
  }

  private async requestTokenWith(
    body: URLSearchParams,
    operation: string,
  ): Promise<TokenResponse> {
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
        body,
        signal: controller.signal,
      });
    } catch (error) {
      const failure = controller.signal.aborted ? 'timeout' : 'unavailable';
      this.logger.error(
        JSON.stringify({ provider: 'mercado_livre', operation, failure }),
        error instanceof Error ? error.message : undefined,
      );
      throw new MercadoLivreError(failure, operation);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // 400 aqui e credencial/refresh token invalido, nao erro do chamador.
      const failure = response.status === 429 ? 'rate_limited' : 'unauthorized';
      this.logger.error(
        JSON.stringify({
          provider: 'mercado_livre',
          operation,
          failure,
          upstreamStatus: response.status,
        }),
      );
      throw new MercadoLivreError(failure, operation, undefined, response.status);
    }

    const payload = (await response.json().catch(() => ({}))) as TokenResponse;

    if (!payload.access_token) {
      throw new MercadoLivreError('unauthorized', operation, undefined, response.status);
    }

    // Nunca logamos o token nem o refresh: so o fato e a validade.
    this.logger.log(
      JSON.stringify({
        provider: 'mercado_livre',
        operation,
        expiresInSeconds: payload.expires_in ?? 21600,
      }),
    );

    return payload;
  }
}
