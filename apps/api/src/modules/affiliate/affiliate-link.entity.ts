import { AffiliateLink, Product } from '@prisma/client';

export interface AffiliateLinkView {
  id: string;
  productId: string;
  product: { id: string; title: string; marketplaceItemId: string } | null;
  url: string;
  label: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

type AffiliateLinkWithProduct = AffiliateLink & { product?: Product | null };

export function toAffiliateLinkView(link: AffiliateLinkWithProduct): AffiliateLinkView {
  return {
    id: link.id,
    productId: link.productId,
    product: link.product
      ? {
          id: link.product.id,
          title: link.product.title,
          marketplaceItemId: link.product.marketplaceItemId,
        }
      : null,
    url: link.url,
    label: link.label,
    active: link.active,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}
