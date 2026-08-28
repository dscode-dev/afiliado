import { Offer, OfferStatus, Product } from '@prisma/client';
import { toDecimalString, toMoneyString } from '../../common/money';

export interface OfferView {
  id: string;
  productId: string;
  product: { id: string; title: string; marketplaceItemId: string } | null;
  price: string;
  originalPrice: string | null;
  discountPercentage: string | null;
  status: OfferStatus;
  detectedAt: string;
  createdAt: string;
  updatedAt: string;
}

type OfferWithProduct = Offer & { product?: Product | null };

export function toOfferView(offer: OfferWithProduct): OfferView {
  return {
    id: offer.id,
    productId: offer.productId,
    product: offer.product
      ? {
          id: offer.product.id,
          title: offer.product.title,
          marketplaceItemId: offer.product.marketplaceItemId,
        }
      : null,
    price: toMoneyString(offer.price) as string,
    originalPrice: toMoneyString(offer.originalPrice),
    discountPercentage: toDecimalString(offer.discountPercentage),
    status: offer.status,
    detectedAt: offer.detectedAt.toISOString(),
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
  };
}
