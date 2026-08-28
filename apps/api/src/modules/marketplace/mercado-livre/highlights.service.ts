import { Injectable } from '@nestjs/common';
import { MercadoLivreClient, MULTIGET_LIMIT } from './mercado-livre.client';
import { MercadoLivreError } from './mercado-livre.errors';
import { MeliHighlightEntry } from './mercado-livre.types';

export interface HighlightView {
  position: number;
  /** Id da entrada como veio do ranking (item ou produto de catalogo). */
  id: string;
  type: string;
  /** Item importavel. Para entradas PRODUCT, e o vencedor do buy box. */
  itemId: string | null;
  title: string | null;
  imageUrl: string | null;
  permalink: string | null;
  /** Preco apenas informativo na descoberta; a importacao busca o preco oficial. */
  price: string | null;
}

export interface HighlightsResult {
  siteId: string;
  categoryId: string;
  categoryName: string | null;
  total: number;
  data: HighlightView[];
}

/** Entradas PRODUCT sao resolvidas uma a uma; limitamos a concorrencia. */
const PRODUCT_RESOLUTION_CONCURRENCY = 4;

/**
 * Consulta os mais vendidos oficiais de uma categoria e resolve o minimo
 * necessario para o operador decidir o que importar.
 *
 * Nada e persistido: descoberta nao enche o catalogo automaticamente.
 */
@Injectable()
export class HighlightsService {
  constructor(private readonly client: MercadoLivreClient) {}

  async byCategory(categoryId: string): Promise<HighlightsResult> {
    const [highlights, categoryName] = await Promise.all([
      this.client.getCategoryHighlights(categoryId),
      this.resolveCategoryName(categoryId),
    ]);

    const entries = (highlights.content ?? []).slice(0, MULTIGET_LIMIT);
    const views = await this.resolve(entries);

    return {
      siteId: this.client.siteId,
      categoryId,
      categoryName,
      total: views.length,
      data: views.sort((a, b) => a.position - b.position),
    };
  }

  /** O nome da categoria e conveniencia de UI: nao derruba a consulta se falhar. */
  private async resolveCategoryName(categoryId: string): Promise<string | null> {
    try {
      const category = await this.client.getCategory(categoryId);
      return category.name ?? null;
    } catch {
      return null;
    }
  }

  private async resolve(entries: MeliHighlightEntry[]): Promise<HighlightView[]> {
    const itemIds = entries.filter((entry) => entry.type !== 'PRODUCT').map((entry) => entry.id);
    const productIds = entries.filter((entry) => entry.type === 'PRODUCT').map((entry) => entry.id);

    // Um unico multiget resolve todos os anuncios da pagina.
    const items = await this.client.getItems(itemIds, [
      'id',
      'title',
      'thumbnail',
      'secure_thumbnail',
      'permalink',
      'price',
      'status',
    ]);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const productsById = await this.resolveCatalogProducts(productIds);

    return entries.map((entry, index) => {
      const position = entry.position ?? index + 1;

      if (entry.type === 'PRODUCT') {
        const product = productsById.get(entry.id);
        const picture = product?.pictures?.[0];

        return {
          position,
          id: entry.id,
          type: 'PRODUCT',
          itemId: product?.buy_box_winner?.item_id ?? null,
          title: product?.name ?? null,
          imageUrl: picture?.secure_url ?? picture?.url ?? null,
          permalink: null,
          price: formatPrice(product?.buy_box_winner?.price),
        };
      }

      const item = itemsById.get(entry.id);

      return {
        position,
        id: entry.id,
        type: entry.type ?? 'ITEM',
        itemId: entry.id,
        title: item?.title ?? null,
        imageUrl: item?.secure_thumbnail ?? item?.thumbnail ?? null,
        permalink: item?.permalink ?? null,
        price: formatPrice(item?.price),
      };
    });
  }

  private async resolveCatalogProducts(
    productIds: string[],
  ): Promise<Map<string, Awaited<ReturnType<MercadoLivreClient['getCatalogProduct']>>>> {
    const resolved = new Map<
      string,
      Awaited<ReturnType<MercadoLivreClient['getCatalogProduct']>>
    >();
    const queue = [...productIds];

    const worker = async (): Promise<void> => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        try {
          resolved.set(id, await this.client.getCatalogProduct(id));
        } catch (error) {
          // Um produto nao resolvido vira linha sem titulo, nao quebra a tela.
          if (!(error instanceof MercadoLivreError)) throw error;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(PRODUCT_RESOLUTION_CONCURRENCY, queue.length) }, worker),
    );

    return resolved;
  }
}

function formatPrice(value: number | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : null;
}
