/**
 * Causas de falha que o operador precisa distinguir ao publicar numa Page.
 * A resposta bruta da Graph API nunca sobe alem desta camada.
 */
export type FacebookFailure =
  | 'invalid_page'
  | 'unauthorized'
  | 'permission_denied'
  | 'expired_token'
  | 'rate_limited'
  | 'invalid_content'
  | 'invalid_media'
  | 'timeout'
  | 'unavailable'
  | 'unknown_outcome';

const MESSAGES: Record<FacebookFailure, string> = {
  invalid_page: 'Page do Facebook invalida ou inacessivel - confira o Page ID',
  unauthorized: 'Access token do Facebook invalido',
  permission_denied:
    'Permissao negada pela Meta - o token precisa de pages_manage_posts nesta Page',
  expired_token:
    'Access token do Facebook expirado ou revogado - gere um novo Page Access Token',
  rate_limited: 'Limite de requisicoes da Graph API atingido',
  invalid_content: 'A Meta recusou o conteudo da publicacao',
  invalid_media: 'A Meta nao aceitou a imagem do produto',
  timeout: 'O Facebook nao respondeu dentro do tempo limite',
  unavailable: 'Graph API indisponivel no momento',
  // Ver "Duplicidade externa" no README: mesma politica conservadora do Telegram.
  unknown_outcome:
    'Resultado desconhecido: o post pode ter sido publicado. Confira a Page antes de reenviar',
};

export class FacebookError extends Error {
  readonly provider = 'facebook';

  constructor(
    readonly failure: FacebookFailure,
    readonly operation: string,
    readonly upstreamStatus?: number,
    /** Codigo numerico da Meta. Util no log; nunca contem credencial. */
    readonly upstreamCode?: number,
  ) {
    super(MESSAGES[failure]);
    this.name = 'FacebookError';
  }

  get logContext(): Record<string, string | number | undefined> {
    return {
      provider: this.provider,
      operation: this.operation,
      failure: this.failure,
      upstreamStatus: this.upstreamStatus,
      upstreamCode: this.upstreamCode,
    };
  }
}

/**
 * Falhas em que repetir e comprovadamente seguro: a Meta respondeu, entao
 * sabemos que o post nao foi criado.
 *
 * `timeout` e `unknown_outcome` NAO entram: repetir uma chamada cujo resultado
 * desconhecemos pode duplicar o post na Page.
 */
export function isSafeToRetry(failure: FacebookFailure): boolean {
  return failure === 'rate_limited' || failure === 'unavailable';
}

/**
 * Classificacao a partir dos codigos oficiais da Graph API.
 *
 * Referencia: developers.facebook.com/docs/graph-api/guides/error-handling
 *  190 (+ subcodes 463/467) token expirado/invalido
 *  10 e 200-299                permissao negada
 *  4, 17, 32, 613              rate limiting (app, usuario e Page)
 *  100                         parametro invalido
 *  803                         objeto inexistente
 */
export function classify(
  status: number,
  code?: number,
  subcode?: number,
  message?: string,
): FacebookFailure {
  if (code === 190) {
    // Subcodes 463/467 indicam expiracao/revogacao explicitamente.
    return subcode === 463 || subcode === 467 || /expired/i.test(message ?? '')
      ? 'expired_token'
      : 'unauthorized';
  }

  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) {
    return 'permission_denied';
  }

  if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) {
    return 'rate_limited';
  }

  if (code === 803) return 'invalid_page';

  if (code === 100) {
    // 100 cobre "parametro invalido"; a mensagem distingue midia de conteudo.
    if (isMediaFailure(message ?? '')) return 'invalid_media';
    return /page|object/i.test(message ?? '') ? 'invalid_page' : 'invalid_content';
  }

  if (status >= 500) return 'unavailable';
  if (status === 401 || status === 403) return 'unauthorized';

  return 'invalid_content';
}

/**
 * Falhas atribuiveis exclusivamente a midia. So nestes casos o publisher cai
 * para o post de texto - qualquer outro erro sobe como esta.
 */
export function isMediaFailure(message: string): boolean {
  const text = message.toLowerCase();

  return (
    text.includes('url could not be processed') ||
    text.includes('could not retrieve data from url') ||
    text.includes('invalid image') ||
    text.includes('unable to fetch') ||
    text.includes('image could not be downloaded') ||
    text.includes('bad image data')
  );
}
