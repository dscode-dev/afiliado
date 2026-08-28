/**
 * Causas de falha que o resto da aplicacao precisa distinguir ao falar com o
 * Mercado Livre. A resposta bruta do provider nunca sobe alem desta camada.
 */
export type MarketplaceFailure =
  | 'invalid_item'
  | 'not_found'
  | 'unauthorized'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable';

const MESSAGES: Record<MarketplaceFailure, string> = {
  invalid_item: 'Identificador de item invalido para o Mercado Livre',
  not_found: 'Recurso nao encontrado no Mercado Livre',
  unauthorized: 'Credenciais do Mercado Livre invalidas ou ausentes',
  rate_limited: 'Limite de requisicoes do Mercado Livre atingido',
  timeout: 'O Mercado Livre nao respondeu dentro do tempo limite',
  unavailable: 'Mercado Livre indisponivel no momento',
};

/**
 * Erro interno consistente. Carrega contexto para o log (`provider`,
 * `operation`, `resourceId`) sem jamais carregar token ou corpo bruto.
 */
export class MercadoLivreError extends Error {
  readonly provider = 'mercado_livre';

  constructor(
    readonly failure: MarketplaceFailure,
    readonly operation: string,
    readonly resourceId?: string,
    /** Status HTTP do provider, util no log. Nunca inclui corpo da resposta. */
    readonly upstreamStatus?: number,
  ) {
    super(MESSAGES[failure]);
    this.name = 'MercadoLivreError';
  }

  /** Contexto estruturado para logging - sem segredos, por construcao. */
  get logContext(): Record<string, string | number | undefined> {
    return {
      provider: this.provider,
      operation: this.operation,
      failure: this.failure,
      resourceId: this.resourceId,
      upstreamStatus: this.upstreamStatus,
    };
  }
}

/** Falhas em que repetir a chamada e seguro e pode resolver. */
export function isTransient(failure: MarketplaceFailure): boolean {
  return failure === 'timeout' || failure === 'unavailable' || failure === 'rate_limited';
}
