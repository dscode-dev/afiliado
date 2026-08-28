import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Marketplace, Prisma, Product } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MercadoLivreClient } from '../marketplace/mercado-livre/mercado-livre.client';
import { MercadoLivreConfig } from '../marketplace/mercado-livre/mercado-livre.config';
import { MercadoLivreError } from '../marketplace/mercado-livre/mercado-livre.errors';
import {
  NormalizedItem,
  NormalizedPrice,
  normalizeItem,
  normalizePrice,
} from '../marketplace/mercado-livre/mercado-livre.normalizer';
import { ProductView, toProductView } from './product.entity';
import { PriceSnapshotService } from './price-snapshot.service';

export type SyncOutcome = 'created' | 'updated' | 'unchanged';

export interface SyncResult {
  product: ProductView;
  outcome: SyncOutcome;
  priceSnapshotCreated: boolean;
}

export interface BatchSyncReport {
  total: number;
  synced: number;
  unchanged: number;
  failed: number;
  failures: { productId: string; marketplaceItemId: string; reason: string }[];
}

/**
 * Cache de nomes de categoria valido apenas dentro de uma operacao.
 *
 * Guarda a promessa, e nao o valor resolvido: com o lote concorrente, varios
 * produtos da mesma categoria partem juntos e sem isso todos chamariam a API.
 */
type CategoryCache = Map<string, Promise<string | null>>;

@Injectable()
export class ProductSyncService {
  private readonly logger = new Logger(ProductSyncService.name);
  private readonly concurrency: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MercadoLivreClient,
    private readonly config: MercadoLivreConfig,
    private readonly snapshots: PriceSnapshotService,
  ) {
    this.concurrency = Math.max(1, Math.min(Number(process.env.MELI_SYNC_CONCURRENCY ?? 4), 8));
  }

  /** Importa um anuncio pelo id do marketplace, criando ou atualizando o Product. */
  async importByItemId(marketplaceItemId: string): Promise<SyncResult> {
    return this.fetchAndApply(marketplaceItemId, new Map());
  }

  /** Sincroniza um produto ja cadastrado. */
  async syncById(productId: string): Promise<SyncResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { marketplaceItemId: true },
    });

    if (!product) {
      throw new NotFoundException(`Produto ${productId} nao encontrado`);
    }

    return this.fetchAndApply(product.marketplaceItemId, new Map());
  }

  /**
   * Sincroniza todos os produtos ativos com concorrencia pequena e controlada.
   * A falha de um item e registrada e nao interrompe o lote.
   */
  async syncActive(): Promise<BatchSyncReport> {
    const products = await this.prisma.product.findMany({
      where: { active: true, marketplace: Marketplace.MERCADO_LIVRE },
      select: { id: true, marketplaceItemId: true },
      orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } },
    });

    const report: BatchSyncReport = {
      total: products.length,
      synced: 0,
      unchanged: 0,
      failed: 0,
      failures: [],
    };

    // Nomes de categoria sao reaproveitados por todo o lote, em memoria.
    const categoryCache: CategoryCache = new Map();
    const queue = [...products];

    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        try {
          const result = await this.fetchAndApply(next.marketplaceItemId, categoryCache);

          if (result.outcome === 'unchanged' && !result.priceSnapshotCreated) {
            report.unchanged += 1;
          } else {
            report.synced += 1;
          }
        } catch (error) {
          report.failed += 1;
          report.failures.push({
            productId: next.id,
            marketplaceItemId: next.marketplaceItemId,
            reason: error instanceof MercadoLivreError ? error.failure : 'unexpected_error',
          });

          this.logger.error(
            JSON.stringify({
              provider: 'mercado_livre',
              operation: 'sync_active',
              itemId: next.marketplaceItemId,
              failure: error instanceof MercadoLivreError ? error.failure : 'unexpected_error',
            }),
          );
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(this.concurrency, queue.length) }, worker),
    );

    this.logger.log(
      JSON.stringify({ provider: 'mercado_livre', operation: 'sync_active', ...summary(report) }),
    );

    return report;
  }

  /**
   * Busca os dados oficiais e aplica ao banco em uma unica transacao.
   *
   * Qualquer falha externa acontece antes da escrita, entao o estado anterior
   * do produto nunca fica corrompido pela metade.
   */
  private async fetchAndApply(
    marketplaceItemId: string,
    categoryCache: CategoryCache,
  ): Promise<SyncResult> {
    const raw = await this.client.getItem(marketplaceItemId);
    const item = normalizeItem(raw, this.config.siteId);

    // Preco vem da API oficial de precos, nao dos campos legados de /items.
    const price = normalizePrice(await this.client.getItemPrices(item.marketplaceItemId), item.marketplaceItemId);
    const categoryName = await this.resolveCategoryName(item.categoryId, categoryCache);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: {
          marketplace_marketplaceItemId: {
            marketplace: Marketplace.MERCADO_LIVRE,
            marketplaceItemId: item.marketplaceItemId,
          },
        },
      });

      const data = this.buildData(item, price, categoryName, existing);
      const product = existing
        ? await tx.product.update({ where: { id: existing.id }, data })
        : await tx.product.create({
            data: {
              marketplace: Marketplace.MERCADO_LIVRE,
              marketplaceItemId: item.marketplaceItemId,
              ...data,
            },
          });

      const priceSnapshotCreated = await this.snapshots.recordIfChanged(
        product.id,
        { price: price.price, originalPrice: price.originalPrice, currencyId: price.currencyId },
        tx,
      );

      const outcome: SyncOutcome = !existing
        ? 'created'
        : hasMeaningfulChange(existing, product)
          ? 'updated'
          : 'unchanged';

      return { product: toProductView(product), outcome, priceSnapshotCreated };
    });
  }

  private buildData(
    item: NormalizedItem,
    price: NormalizedPrice,
    categoryName: string | null,
    existing: Product | null,
  ): SyncedProductFields {
    return {
      title: item.title,
      category: categoryName ?? existing?.category ?? null,
      categoryId: item.categoryId,
      imageUrl: item.imageUrl,
      permalink: item.permalink,
      sellerId: item.sellerId,
      currencyId: price.currencyId ?? item.currencyId,
      marketplaceStatus: item.marketplaceStatus,
      currentPrice: price.price,
      originalPrice: price.originalPrice,
      lastSyncedAt: new Date(),
      // `active` e nossa flag de monitoramento: o sync so a desliga quando o
      // anuncio encerra de vez. `paused` e temporario e nao desativa nada,
      // e nunca reativamos algo que o operador desligou.
      ...(item.marketplaceStatus === 'closed' ? { active: false } : {}),
    };
  }

  private resolveCategoryName(
    categoryId: string | null,
    cache: CategoryCache,
  ): Promise<string | null> {
    if (!categoryId) return Promise.resolve(null);

    const cached = cache.get(categoryId);
    if (cached) return cached;

    const pending = this.client
      .getCategory(categoryId)
      .then((category) => category.name ?? null)
      .catch((error: unknown) => {
        // Nome da categoria e enriquecimento: nao invalida a sincronizacao.
        if (!(error instanceof MercadoLivreError)) throw error;
        return null;
      });

    cache.set(categoryId, pending);
    return pending;
  }
}

/**
 * Campos escritos pela sincronizacao. Tipo proprio (e nao `ProductUpdateInput`)
 * para que o mesmo objeto sirva ao create e ao update.
 */
interface SyncedProductFields {
  title: string;
  category: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  permalink: string | null;
  sellerId: string | null;
  currencyId: string | null;
  marketplaceStatus: string | null;
  currentPrice: Prisma.Decimal;
  originalPrice: Prisma.Decimal | null;
  lastSyncedAt: Date;
  active?: boolean;
}

/** `lastSyncedAt` muda sempre; sozinho nao caracteriza mudanca real. */
function hasMeaningfulChange(before: Product, after: Product): boolean {
  return (
    before.title !== after.title ||
    before.category !== after.category ||
    before.categoryId !== after.categoryId ||
    before.imageUrl !== after.imageUrl ||
    before.permalink !== after.permalink ||
    before.sellerId !== after.sellerId ||
    before.currencyId !== after.currencyId ||
    before.marketplaceStatus !== after.marketplaceStatus ||
    before.active !== after.active ||
    !before.currentPrice.equals(after.currentPrice) ||
    !equalNullableDecimal(before.originalPrice, after.originalPrice)
  );
}

function equalNullableDecimal(a: Prisma.Decimal | null, b: Prisma.Decimal | null): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

function summary(report: BatchSyncReport): Record<string, number> {
  return {
    total: report.total,
    synced: report.synced,
    unchanged: report.unchanged,
    failed: report.failed,
  };
}
