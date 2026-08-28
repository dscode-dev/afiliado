import { Prisma } from '@prisma/client';
import { MercadoLivreError } from './mercado-livre.errors';
import { MeliItem, MeliPriceEntry, MeliPrices } from './mercado-livre.types';

/** Dados do anuncio ja normalizados para o nosso modelo operacional. */
export interface NormalizedItem {
  marketplaceItemId: string;
  title: string;
  categoryId: string | null;
  currencyId: string | null;
  permalink: string | null;
  sellerId: string | null;
  imageUrl: string | null;
  marketplaceStatus: string | null;
}

/** Preco vigente, vindo da API oficial de precos. */
export interface NormalizedPrice {
  price: Prisma.Decimal;
  originalPrice: Prisma.Decimal | null;
  currencyId: string | null;
}

/**
 * Converte numero em Decimal monetario com 2 casas.
 * Passa por string para nao herdar ruido de ponto flutuante.
 */
export function toMoneyDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(String(value)).toDecimalPlaces(2);
}

/**
 * Normaliza `/items/:id`, validando que o anuncio pertence ao site esperado.
 * Somente os campos usados pela aplicacao sao extraidos.
 */
export function normalizeItem(item: MeliItem, expectedSiteId: string): NormalizedItem {
  if (!item?.id) {
    throw new MercadoLivreError('invalid_item', 'normalize_item');
  }

  // O site vem no payload; quando ausente, o prefixo do id identifica o site.
  const siteId = item.site_id ?? item.id.slice(0, 3);
  if (siteId !== expectedSiteId) {
    throw new MercadoLivreError('invalid_item', 'normalize_item', item.id);
  }

  const title = item.title?.trim();
  if (!title) {
    throw new MercadoLivreError('invalid_item', 'normalize_item', item.id);
  }

  return {
    marketplaceItemId: item.id,
    title,
    categoryId: item.category_id ?? null,
    currencyId: item.currency_id ?? null,
    permalink: item.permalink ?? null,
    sellerId: item.seller_id === undefined || item.seller_id === null
      ? null
      : String(item.seller_id),
    imageUrl: pickImage(item),
    marketplaceStatus: item.status ?? null,
  };
}

/** Prefere imagem segura em alta, caindo para o thumbnail quando necessario. */
function pickImage(item: MeliItem): string | null {
  const picture = item.pictures?.find((entry) => entry.secure_url ?? entry.url);

  return picture?.secure_url ?? picture?.url ?? item.secure_thumbnail ?? item.thumbnail ?? null;
}

/**
 * Normaliza `/items/:id/prices`.
 *
 * A entrada `standard` e o preco de venda vigente; `regular_amount` e o valor
 * "de", presente somente quando ha desconto. Entradas com janela de validade
 * expirada sao ignoradas.
 */
export function normalizePrice(
  prices: MeliPrices,
  itemId: string,
  now: Date = new Date(),
): NormalizedPrice {
  const candidates = (prices?.prices ?? []).filter((entry) => isActive(entry, now));
  const standard = candidates.find((entry) => entry.type === 'standard');
  const chosen = standard ?? candidates[0];

  if (!chosen || typeof chosen.amount !== 'number' || !Number.isFinite(chosen.amount)) {
    throw new MercadoLivreError('invalid_item', 'normalize_price', itemId);
  }

  if (chosen.amount < 0) {
    throw new MercadoLivreError('invalid_item', 'normalize_price', itemId);
  }

  const regular = chosen.regular_amount;
  // `regular_amount` so vira "preco de" quando realmente for maior que o vigente.
  const hasDiscount =
    typeof regular === 'number' && Number.isFinite(regular) && regular > chosen.amount;

  return {
    price: toMoneyDecimal(chosen.amount),
    originalPrice: hasDiscount ? toMoneyDecimal(regular) : null,
    currencyId: chosen.currency_id ?? null,
  };
}

function isActive(entry: MeliPriceEntry, now: Date): boolean {
  const start = entry.conditions?.start_time;
  const end = entry.conditions?.end_time;

  if (start && new Date(start).getTime() > now.getTime()) return false;
  if (end && new Date(end).getTime() < now.getTime()) return false;

  return true;
}
