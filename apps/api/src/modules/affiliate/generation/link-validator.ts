import { AffiliateGenerationError } from './affiliate-bot.client';

/** Hosts que o Mercado Livre usa nos links de afiliado. */
const ALLOWED_HOSTS = [
  'mercadolivre.com',
  'mercadolivre.com.br',
  'mercadolibre.com',
  'mercadolibre.com.br',
  'mercadolivre.com.ar',
];

function hostAllowed(host: string): boolean {
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export interface ValidationInput {
  url: string;
  originUrl: string;
  tag: string;
  expectedTag: string;
  productPermalink: string | null;
}

/**
 * Valida o link antes de persistir.
 *
 * O ponto e nao gravar nada que pareca link de afiliado mas nao monetize:
 * URL vazia, host estranho, tag de outra conta ou - o caso mais perigoso -
 * simplesmente o permalink comum do produto devolvido de volta.
 *
 * A URL nunca e reconstruida aqui: ou o provider devolveu algo valido, ou
 * falhamos.
 */
export function validateGeneratedLink(input: ValidationInput): void {
  const raw = input.url?.trim();

  if (!raw) {
    throw new AffiliateGenerationError('INVALID_LINK', 'Link de afiliado vazio');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AffiliateGenerationError('INVALID_LINK', 'Link de afiliado nao e uma URL valida');
  }

  if (parsed.protocol !== 'https:') {
    throw new AffiliateGenerationError('INVALID_LINK', 'Link de afiliado precisa ser HTTPS');
  }

  if (!hostAllowed(parsed.hostname)) {
    throw new AffiliateGenerationError(
      'INVALID_LINK',
      `Host inesperado no link de afiliado: ${parsed.hostname}`,
    );
  }

  if (input.tag !== input.expectedTag) {
    throw new AffiliateGenerationError(
      'INVALID_LINK',
      'A tag devolvida nao corresponde a tag ativa',
    );
  }

  // O que separa um link monetizado de uma URL de produto comum nao e o
  // dominio nem o caminho - e carregar rastreio de afiliado. Comparar com o
  // permalink nao bastaria: `www.mercadolivre.com.br/MLB-123` e
  // `produto.mercadolivre.com.br/MLB-123` sao a mesma pagina nao monetizada
  // com hosts diferentes.
  if (!carriesAffiliateTracking(parsed, input.tag)) {
    throw new AffiliateGenerationError(
      'INVALID_LINK',
      'O provider devolveu uma URL de produto comum, sem rastreio de afiliado',
    );
  }

  // `origin_url` precisa apontar para o mesmo produto que pedimos.
  if (input.productPermalink && input.originUrl && !sameProduct(input.originUrl, input.productPermalink)) {
    throw new AffiliateGenerationError(
      'INVALID_LINK',
      'origin_url nao corresponde ao produto solicitado',
    );
  }
}

/**
 * Um link de afiliado do Mercado Livre e um short link (`/sec/...`) ou uma URL
 * longa com os parametros de rastreio. Sem nada disso, o clique nao e
 * atribuido a ninguem.
 */
function carriesAffiliateTracking(url: URL, tag: string): boolean {
  if (/^\/sec\//i.test(url.pathname)) return true;

  const params = url.searchParams;
  if (params.has('matt_tool') || params.has('matt_word') || params.has('forceInApp')) {
    return true;
  }

  return [...params.values()].some((value) => value === tag);
}

function normalize(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url;
  }
}

function sameUrl(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

/**
 * O `origin_url` pode vir normalizado pelo Mercado Livre (com ou sem `www`,
 * com ou sem query), entao comparamos host + caminho, e tambem aceitamos que
 * um contenha o identificador do outro.
 */
function sameProduct(originUrl: string, permalink: string): boolean {
  if (sameUrl(originUrl, permalink)) return true;

  const id = extractItemId(permalink);

  return id !== null && extractItemId(originUrl) === id;
}

function extractItemId(url: string): string | null {
  const match = /MLB-?(\d{6,})/i.exec(url);

  return match ? `MLB${match[1]}` : null;
}
