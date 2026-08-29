import { Prisma } from '@prisma/client';
import { OfferHighlights, sanitizeTitle } from '../telegram/message.renderer';

export interface WhatsAppRenderInput {
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
 * Renderer do WhatsApp.
 *
 * Nao existe API oficial para publicar em Canais do WhatsApp (ver README), entao
 * este texto e gerado para o operador copiar e colar. Por isso e ainda mais
 * curto que o do Telegram e o do Facebook: precisa caber bem na tela de um
 * celular e sobreviver a um copiar/colar sem formatacao.
 *
 * Texto puro: o WhatsApp interpreta `*`, `_` e `~` como formatacao, entao o
 * titulo e sanitizado e nao usamos nenhum desses caracteres de proposito.
 *
 * Deterministico: a mesma entrada produz sempre exatamente o mesmo texto.
 */
export function renderWhatsAppMessage(input: WhatsAppRenderInput): string {
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

  lines.push('', '\u{1F449} Confira no Mercado Livre:', input.affiliateUrl);

  return lines.join('\n');
}

function relevantDiscount(input: WhatsAppRenderInput): number | null {
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
