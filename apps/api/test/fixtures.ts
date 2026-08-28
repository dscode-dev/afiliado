import { Marketplace } from '@prisma/client';

let sequence = 0;

/** Payload valido de produto; cada chamada gera um marketplaceItemId distinto. */
export function productPayload(overrides: Record<string, unknown> = {}) {
  sequence += 1;

  return {
    marketplace: Marketplace.MERCADO_LIVRE,
    marketplaceItemId: `MLB${1000 + sequence}`,
    title: `Fone de ouvido bluetooth ${sequence}`,
    category: 'Eletronicos',
    imageUrl: 'https://http2.mlstatic.com/imagem.jpg',
    currentPrice: '199.90',
    originalPrice: '299.90',
    ...overrides,
  };
}
