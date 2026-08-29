import { Prisma } from '@prisma/client';

/**
 * Sinais do Opportunity Engine que sustentam afirmacoes na copy.
 * Nada aqui e estimado: cada flag vem de um componente que realmente pontuou.
 */
export interface OfferHighlights {
  /** Produto presente no ranking oficial de mais vendidos. */
  amongBestSellers: boolean;
  /** Preco atual no piso (ou praticamente no piso) do historico acompanhado. */
  nearLowestTrackedPrice: boolean;
}

export interface RenderInput {
  title: string;
  price: Prisma.Decimal;
  originalPrice: Prisma.Decimal | null;
  discountPercentage: Prisma.Decimal | null;
  affiliateUrl: string;
  highlights: OfferHighlights;
}

/** Legenda de foto no Telegram tem limite de 1024 caracteres. */
export const CAPTION_MAX_LENGTH = 1024;
/** Espaco reservado ao titulo para que a mensagem nunca estoure o limite. */
export const TITLE_MAX_LENGTH = 180;

/** Desconto abaixo disto nao vira destaque: nao e uma oferta relevante. */
const MIN_RELEVANT_DISCOUNT = 5;

/**
 * Renderiza a mensagem da oferta.
 *
 * Texto puro, sem `parse_mode`: nao ha markup para um titulo vindo do
 * marketplace quebrar, nem risco de o Telegram recusar a mensagem por
 * "can't parse entities". O Telegram transforma a URL crua em link
 * automaticamente, entao o CTA continua clicavel.
 *
 * Deterministico: a mesma entrada produz sempre exatamente o mesmo texto.
 */
export function renderOfferMessage(input: RenderInput): string {
  const lines: string[] = ['\u{1F525} OFERTA', '', sanitizeTitle(input.title), ''];

  // "De:" so aparece quando existe preco anterior oficialmente maior.
  if (input.originalPrice && input.originalPrice.greaterThan(input.price)) {
    lines.push(`De: ${formatBrl(input.originalPrice)}`);
  }
  lines.push(`Por: ${formatBrl(input.price)}`);

  const discount = relevantDiscount(input);
  if (discount !== null) {
    lines.push('', `\u{1F4C9} ${discount}% de desconto`);
  }

  // Afirmacoes sustentadas por dados do engine - nunca inventadas.
  if (input.highlights.nearLowestTrackedPrice) {
    lines.push('\u{1F4CA} Proximo do menor preco que acompanhamos');
  }
  if (input.highlights.amongBestSellers) {
    lines.push('\u2B50 Entre os mais vendidos da categoria');
  }

  lines.push('', '\u{1F6D2} Ver no Mercado Livre', input.affiliateUrl);

  return lines.join('\n');
}

/**
 * Remove quebras de linha e caracteres de controle do titulo externo e limita
 * o tamanho, para que a mensagem final seja sempre previsivel.
 */
export function sanitizeTitle(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= TITLE_MAX_LENGTH) return cleaned;

  return `${cleaned.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}\u2026`;
}

/**
 * Usa o desconto ja calculado na Offer; se ausente, deriva dos precos.
 * Retorna null quando nao ha desconto confiavel ou relevante - preferimos
 * omitir a linha a publicar um percentual duvidoso.
 */
function relevantDiscount(input: RenderInput): number | null {
  let percentage: number | null = null;

  if (input.discountPercentage) {
    percentage = input.discountPercentage.toNumber();
  } else if (input.originalPrice && input.originalPrice.greaterThan(input.price)) {
    percentage = input.originalPrice
      .minus(input.price)
      .dividedBy(input.originalPrice)
      .times(100)
      .toNumber();
  }

  if (percentage === null || percentage < MIN_RELEVANT_DISCOUNT) return null;

  return Math.round(percentage);
}

function formatBrl(value: Prisma.Decimal): string {
  const [integer, decimals] = value.toFixed(2).split('.');
  const withSeparator = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `R$ ${withSeparator},${decimals}`;
}
