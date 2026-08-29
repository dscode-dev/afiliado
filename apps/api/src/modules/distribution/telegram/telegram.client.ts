import { Injectable, Logger } from '@nestjs/common';
import { TelegramConfig } from './telegram.config';
import { TelegramError, TelegramFailure, isSafeToRetry } from './telegram.errors';

interface TelegramResponse {
  ok?: boolean;
  result?: { message_id?: number; id?: number | string; title?: string; username?: string };
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export interface SentMessage {
  /** Id da mensagem no canal, persistido em Publication.externalMessageId. */
  messageId: string;
}

export interface ChatInfo {
  id: string;
  title: string | null;
  username: string | null;
}

const MAX_ATTEMPTS = 2;

/**
 * Client explicito da Bot API oficial do Telegram.
 *
 * Expoe somente os tres metodos que a aplicacao usa. Toda falha vira
 * `TelegramError` - a resposta bruta do Telegram nunca sai daqui, e o token
 * nunca entra em log nem em mensagem de erro.
 */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger(TelegramClient.name);

  constructor(private readonly config: TelegramConfig) {}

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  /** POST /sendMessage - publicacao em texto. */
  async sendMessage(chatId: string, text: string): Promise<SentMessage> {
    const response = await this.call('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
    });

    return { messageId: String(response.result?.message_id ?? '') };
  }

  /** POST /sendPhoto - publicacao com imagem do produto e legenda. */
  async sendPhoto(chatId: string, photoUrl: string, caption: string): Promise<SentMessage> {
    const response = await this.call('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption,
    });

    return { messageId: String(response.result?.message_id ?? '') };
  }

  /**
   * POST /getChat - valida o canal sem publicar nada.
   * Usado pela acao "Testar canal" do admin, que nao pode gerar spam.
   */
  async getChat(chatId: string): Promise<ChatInfo> {
    const response = await this.call('getChat', { chat_id: chatId });

    return {
      id: String(response.result?.id ?? chatId),
      title: response.result?.title ?? null,
      username: response.result?.username ?? null,
    };
  }

  private async call(method: string, body: Record<string, unknown>): Promise<TelegramResponse> {
    if (!this.config.isConfigured) {
      throw new TelegramError('bot_unauthorized', method);
    }

    let lastError: TelegramError | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.execute(method, body);
      } catch (error) {
        if (!(error instanceof TelegramError) || !isSafeToRetry(error.failure)) {
          throw error;
        }

        lastError = error;

        if (attempt < MAX_ATTEMPTS) {
          await this.waitBeforeRetry(error);
        }
      }
    }

    throw lastError;
  }

  /** Respeita `retry_after` do Telegram, com teto para nao prender a request. */
  private async waitBeforeRetry(error: TelegramError): Promise<void> {
    const suggested = error.retryAfterSeconds ?? 1;

    if (suggested > this.config.maxRetryAfterSeconds) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, suggested * 1000));
  }

  private async execute(method: string, body: Record<string, unknown>): Promise<TelegramResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.config.methodUrl(method), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      // A requisicao ja pode ter chegado ao Telegram: o resultado e ambiguo e
      // NAO pode ser repetido automaticamente (ver README).
      const failure: TelegramFailure = controller.signal.aborted ? 'unknown_outcome' : 'unavailable';
      this.fail(failure, method, undefined, undefined, error);
    } finally {
      clearTimeout(timer);
    }

    let payload: TelegramResponse;
    try {
      payload = (await response.json()) as TelegramResponse;
    } catch {
      this.fail('unavailable', method, response.status);
    }

    if (!response.ok || payload.ok !== true) {
      const retryAfter = payload.parameters?.retry_after;
      this.fail(
        classify(response.status, payload.description),
        method,
        response.status,
        retryAfter,
      );
    }

    return payload;
  }

  private fail(
    failure: TelegramFailure,
    operation: string,
    upstreamStatus?: number,
    retryAfterSeconds?: number,
    cause?: unknown,
  ): never {
    const error = new TelegramError(failure, operation, upstreamStatus, retryAfterSeconds);

    // Log sem token, sem URL (a URL contem o token) e sem corpo da resposta.
    this.logger.error(
      JSON.stringify(error.logContext),
      cause instanceof Error ? cause.name : undefined,
    );

    throw error;
  }
}

/**
 * O Telegram responde 400 para praticamente tudo, com a causa real apenas em
 * `description`. Mapeamos as descricoes conhecidas para causas acionaveis.
 */
export function classify(status: number, description?: string): TelegramFailure {
  const text = (description ?? '').toLowerCase();

  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';

  if (status === 401 || text.includes('unauthorized')) return 'bot_unauthorized';

  if (text.includes('not enough rights') || text.includes('need administrator rights')) {
    return 'bot_not_administrator';
  }
  if (text.includes('chat not found')) return 'chat_not_found';
  if (text.includes('bot was kicked') || text.includes('bot is not a member')) {
    return 'bot_not_administrator';
  }
  if (text.includes('chat_id is empty') || text.includes('invalid chat')) return 'invalid_channel';

  if (isMediaFailure(text)) return 'invalid_media';

  return 'invalid_message';
}

/**
 * Falhas atribuiveis exclusivamente a midia. So nestes casos o publisher tenta
 * o fallback para texto - qualquer outro erro sobe como esta.
 */
export function isMediaFailure(description: string): boolean {
  const text = description.toLowerCase();

  return (
    text.includes('failed to get http url content') ||
    text.includes('wrong file identifier') ||
    text.includes('wrong type of the web page content') ||
    text.includes('photo_invalid_dimensions') ||
    text.includes('image_process_failed') ||
    text.includes('webpage_curl_failed') ||
    text.includes('wrong remote file identifier')
  );
}
