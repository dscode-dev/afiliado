import { Marketplace, Product } from '@prisma/client';
import { toMoneyString } from '../../common/money';

export interface ProductView {
  id: string;
  marketplace: Marketplace;
  marketplaceItemId: string;
  title: string;
  category: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  permalink: string | null;
  sellerId: string | null;
  currencyId: string | null;
  marketplaceStatus: string | null;
  highlightPosition: number | null;
  highlightCheckedAt: string | null;
  sellerReputationLevel: string | null;
  sellerStatus: string | null;
  currentPrice: string;
  originalPrice: string | null;
  active: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toProductView(product: Product): ProductView {
  return {
    id: product.id,
    marketplace: product.marketplace,
    marketplaceItemId: product.marketplaceItemId,
    title: product.title,
    category: product.category,
    categoryId: product.categoryId,
    imageUrl: product.imageUrl,
    permalink: product.permalink,
    sellerId: product.sellerId,
    currencyId: product.currencyId,
    marketplaceStatus: product.marketplaceStatus,
    highlightPosition: product.highlightPosition,
    highlightCheckedAt: product.highlightCheckedAt?.toISOString() ?? null,
    sellerReputationLevel: product.sellerReputationLevel,
    sellerStatus: product.sellerStatus,
    currentPrice: toMoneyString(product.currentPrice) as string,
    originalPrice: toMoneyString(product.originalPrice),
    active: product.active,
    lastSyncedAt: product.lastSyncedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
