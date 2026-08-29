import { Prisma } from '@prisma/client';
import { OfferHighlights, sanitizeTitle } from '../telegram/message.renderer';

export interface FacebookRenderInput {
  title: string;
  price: Prisma.Decimal;
  originalPrice: Prisma.Decimal | null;
  discountPercentage: Prisma.Decimal | null;
  affiliateUrl: string;
  highlights: OfferHighlights;
}

/** Desconto abaixo disto nao vira destaque: nao e uma oferta relevante. */
const MIN_RELEVANT_DISCOUNT = 5;

/**
 * Renderer do Facebook.
 *
 * Superficie diferente da do Telegram: o feed da Page ja mostra o link como
 * card, e a copy respira melhor em frases do que em linhas curtas. Por isso o
 * texto e proprio, e nao uma reutilizacao cega da mensagem do Telegram.
 *
 * Texto puro, sem markup: a Graph API publica exatamente o que enviamos, entao
 * um titulo vindo do marketplace nao tem como quebrar formatacao.
 *
 * Deterministico: a mesma entrada produz sempre exatamente o mesmo texto.
 */
export function renderFacebookPost(input: FacebookRenderInput): string {
  const lines: string[] = ['\u{1F525} Oferta encontrada', '', sanitizeTitle(input.title), ''];

  if (input.originalPrice && input.originalPrice.greaterThan(input.price)) {
    lines.push(`De ${formatBrl(input.originalPrice)}`);
    lines.push(`por ${formatBrl(input.price)}`);
  } else {
    lines.push(`Por ${formatBrl(input.price)}`);
  }

  const discount = relevantDiscount(input);
  if (discount !== null) {
    lines.push('', `\u{1F4C9} ${discount}% de desconto`);
  }

  // Afirmacoes sustentadas por dados do Opportunity Engine - nunca inventadas.
  if (input.highlights.nearLowestTrackedPrice) {
    lines.push('\u{1F4CA} Proximo do menor preco que acompanhamos');
  }
  if (input.highlights.amongBestSellers) {
    lines.push('\u2B50 Entre os mais vendidos da categoria');
  }

  lines.push('', 'Confira no Mercado Livre:', input.affiliateUrl);

  return lines.join('\n');
}

/**
 * Usa o desconto ja calculado na Offer; se ausente, deriva dos precos.
 * Retorna null quando nao ha desconto confiavel ou relevante.
 */
function relevantDiscount(input: FacebookRenderInput): number | null {
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
