/** Situacao da sessao do bot na Central de Afiliados. */
export type BotStatus = 'READY' | 'AUTH_REQUIRED' | 'UNAVAILABLE';

export interface StatusResponse {
  status: BotStatus;
  /** Tag ativa descoberta, quando a sessao esta valida. */
  tag: string | null;
  detail?: string;
}

export interface GeneratedLink {
  url: string;
  originUrl: string;
  tag: string;
}

/**
 * Falhas do adapter. `AUTH_REQUIRED` significa que um humano precisa
 * autenticar uma unica vez - nunca que ha operacao manual por produto.
 */
export type BotFailure =
  | 'AUTH_REQUIRED'
  | 'NO_ACTIVE_TAG'
  | 'AMBIGUOUS_TAG'
  | 'INVALID_RESPONSE'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'TIMEOUT';

export class AffiliateBotError extends Error {
  constructor(
    readonly failure: BotFailure,
    message: string,
  ) {
    super(message);
    this.name = 'AffiliateBotError';
  }
}
