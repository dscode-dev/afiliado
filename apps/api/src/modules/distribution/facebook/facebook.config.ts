import { Injectable } from '@nestjs/common';

/**
 * Configuracao da integracao com a Meta.
 *
 * O Page Access Token vive apenas aqui, vindo de environment variables:
 * nunca e persistido em `Channel.configuration`, retornado pela API interna,
 * escrito em log ou exposto ao frontend.
 */
@Injectable()
export class FacebookConfig {
  readonly apiBaseUrl: string;
  readonly apiVersion: string;
  readonly timeoutMs: number;
  readonly maxRetryAfterSeconds: number;
  readonly appId?: string;

  private readonly appSecret?: string;
  private readonly pageAccessToken?: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiBaseUrl = (env.META_API_BASE_URL ?? 'https://graph.facebook.com').replace(/\/+$/, '');
    this.apiVersion = env.META_API_VERSION ?? 'v21.0';
    this.timeoutMs = Number(env.META_TIMEOUT_MS ?? 15000);
    this.maxRetryAfterSeconds = Number(env.META_MAX_RETRY_AFTER_SECONDS ?? 5);
    this.appId = env.META_APP_ID || undefined;
    this.appSecret = env.META_APP_SECRET || undefined;
    this.pageAccessToken = env.META_PAGE_ACCESS_TOKEN || undefined;
  }

  /** Publicar exige o Page Access Token; app id/secret sozinhos nao bastam. */
  get isConfigured(): boolean {
    return Boolean(this.pageAccessToken);
  }

  /** URL de um nó da Graph API. O token vai no corpo/query, nunca no path. */
  endpoint(path: string): string {
    return `${this.apiBaseUrl}/${this.apiVersion}/${path.replace(/^\/+/, '')}`;
  }

  /** Token para a chamada. Retornado sob demanda, nunca guardado em log. */
  token(): string {
    return this.pageAccessToken ?? '';
  }

  /** Impede que a config vaze secrets se cair em um log por acidente. */
  toJSON(): Record<string, unknown> {
    return {
      apiBaseUrl: this.apiBaseUrl,
      apiVersion: this.apiVersion,
      timeoutMs: this.timeoutMs,
      appId: this.appId ? '[set]' : undefined,
      appSecret: this.appSecret ? '[redacted]' : undefined,
      pageAccessToken: this.pageAccessToken ? '[redacted]' : undefined,
    };
  }
}
