/**
 * Causas de falha que o operador precisa distinguir ao publicar no Telegram.
 * A resposta bruta da Bot API nunca sobe alem desta camada.
 */
export type TelegramFailure =
  | 'invalid_channel'
  | 'bot_unauthorized'
  | 'bot_not_administrator'
  | 'chat_not_found'
  | 'rate_limited'
  | 'invalid_media'
  | 'invalid_message'
  | 'timeout'
  | 'unavailable'
  | 'unknown_outcome';

const MESSAGES: Record<TelegramFailure, string> = {
  invalid_channel: 'Canal do Telegram invalido ou mal configurado',
  bot_unauthorized: 'Token do bot invalido ou revogado',
  bot_not_administrator: 'O bot precisa ser administrador do canal para publicar',
  chat_not_found: 'Canal nao encontrado pelo Telegram - confira o externalIdentifier',
  rate_limited: 'Limite de requisicoes do Telegram atingido',
  invalid_media: 'O Telegram nao aceitou a imagem do produto',
  invalid_message: 'O Telegram recusou o conteudo da mensagem',
  timeout: 'O Telegram nao respondeu dentro do tempo limite',
  unavailable: 'Telegram indisponivel no momento',
  // Ver a secao "Duplicidade externa" no README.
  unknown_outcome:
    'Resultado desconhecido: a mensagem pode ter sido publicada. Confira o canal antes de reenviar',
};

export class TelegramError extends Error {
  readonly provider = 'telegram';

  constructor(
    readonly failure: TelegramFailure,
    readonly operation: string,
    readonly upstreamStatus?: number,
    /** Segundos sugeridos pelo Telegram em respostas 429. */
    readonly retryAfterSeconds?: number,
  ) {
    super(MESSAGES[failure]);
    this.name = 'TelegramError';
  }

  /** Contexto para log. Nunca inclui token nem corpo bruto da resposta. */
  get logContext(): Record<string, string | number | undefined> {
    return {
      provider: this.provider,
      operation: this.operation,
      failure: this.failure,
      upstreamStatus: this.upstreamStatus,
    };
  }
}

/**
 * Falhas em que repetir e comprovadamente seguro: o Telegram respondeu, entao
 * sabemos que a mensagem nao foi entregue.
 *
 * `timeout` e `unknown_outcome` NAO estao aqui de proposito - repetir uma
 * chamada cujo resultado desconhecemos pode duplicar a publicacao.
 */
export function isSafeToRetry(failure: TelegramFailure): boolean {
  return failure === 'rate_limited' || failure === 'unavailable';
}
