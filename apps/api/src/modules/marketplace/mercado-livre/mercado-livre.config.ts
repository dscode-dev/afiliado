import { Injectable } from '@nestjs/common';

/** Grants suportados. `client_credentials` e o fluxo servidor-a-servidor. */
export type MercadoLivreGrant = 'client_credentials' | 'refresh_token';

/**
 * Configuracao da integracao, lida uma unica vez das environment variables.
 * `clientSecret` e `refreshToken` nunca sao expostos em toString/JSON.
 */
@Injectable()
export class MercadoLivreConfig {
  readonly apiBaseUrl: string;
  readonly siteId: string;
  readonly timeoutMs: number;
  readonly clientId?: string;
  readonly redirectUri?: string;

  private readonly clientSecret?: string;
  private readonly refreshToken?: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiBaseUrl = (env.MELI_API_BASE_URL ?? 'https://api.mercadolibre.com').replace(/\/+$/, '');
    this.siteId = env.MELI_SITE_ID ?? 'MLB';
    this.timeoutMs = Number(env.MELI_TIMEOUT_MS ?? 10000);
    this.clientId = env.MELI_CLIENT_ID || undefined;
    this.redirectUri = env.MELI_REDIRECT_URI || undefined;
    this.clientSecret = env.MELI_CLIENT_SECRET || undefined;
    this.refreshToken = env.MELI_REFRESH_TOKEN || undefined;
  }

  /** A integracao so opera com client id + secret configurados. */
  get isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Com refresh token configurado usamos o grant de usuario; caso contrario,
   * o grant de aplicacao. Ambos vem apenas de environment variables.
   */
  get grant(): MercadoLivreGrant {
    return this.refreshToken ? 'refresh_token' : 'client_credentials';
  }

  /** Corpo do POST /oauth/token. Retornado sob demanda, nunca guardado em log. */
  tokenRequestBody(): URLSearchParams {
    const body = new URLSearchParams({
      grant_type: this.grant,
      client_id: this.clientId ?? '',
      client_secret: this.clientSecret ?? '',
    });

    if (this.grant === 'refresh_token') {
      body.set('refresh_token', this.refreshToken ?? '');
    }

    return body;
  }

  /** Impede que a config vaze secrets se cair em um log por acidente. */
  toJSON(): Record<string, unknown> {
    return {
      apiBaseUrl: this.apiBaseUrl,
      siteId: this.siteId,
      timeoutMs: this.timeoutMs,
      clientId: this.clientId ? '[set]' : undefined,
      clientSecret: this.clientSecret ? '[redacted]' : undefined,
      refreshToken: this.refreshToken ? '[redacted]' : undefined,
      grant: this.grant,
    };
  }
}
