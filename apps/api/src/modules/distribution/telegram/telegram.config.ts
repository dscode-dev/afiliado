import { Injectable } from '@nestjs/common';

/**
 * Configuracao do bot. O token vive apenas aqui, vindo de environment
 * variables: nunca e persistido, retornado pela API ou escrito em log.
 */
@Injectable()
export class TelegramConfig {
  readonly apiBaseUrl: string;
  readonly timeoutMs: number;
  /** Teto para o `retry_after` do Telegram: acima disso preferimos falhar. */
  readonly maxRetryAfterSeconds: number;

  private readonly botToken?: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiBaseUrl = (env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org').replace(/\/+$/, '');
    this.timeoutMs = Number(env.TELEGRAM_TIMEOUT_MS ?? 15000);
    this.maxRetryAfterSeconds = Number(env.TELEGRAM_MAX_RETRY_AFTER_SECONDS ?? 5);
    this.botToken = env.TELEGRAM_BOT_TOKEN || undefined;
  }

  get isConfigured(): boolean {
    return Boolean(this.botToken);
  }

  /**
   * URL do metodo da Bot API. O token faz parte do caminho, entao esta URL
   * e sensivel e NUNCA pode ser logada ou devolvida em mensagem de erro.
   */
  methodUrl(method: string): string {
    return `${this.apiBaseUrl}/bot${this.botToken}/${method}`;
  }

  /** Impede que o token vaze se a config cair em um log por acidente. */
  toJSON(): Record<string, unknown> {
    return {
      apiBaseUrl: this.apiBaseUrl,
      timeoutMs: this.timeoutMs,
      botToken: this.botToken ? '[redacted]' : undefined,
    };
  }
}
