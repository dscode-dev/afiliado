import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MercadoLivreClient } from '../marketplace/mercado-livre/mercado-livre.client';
import { MercadoLivreError } from '../marketplace/mercado-livre/mercado-livre.errors';

export interface PopularityReport {
  categories: number;
  productsChecked: number;
  productsRanked: number;
  failedCategories: { categoryId: string; reason: string }[];
}

/**
 * Atualiza o sinal de popularidade dos produtos ativos a partir do ranking
 * oficial de mais vendidos.
 *
 * Existe como operacao explicita para que o Opportunity Engine nunca precise
 * fazer chamada externa durante a avaliacao: ele le apenas o que ja esta no
 * banco. Uma chamada por categoria distinta, nao por produto.
 */
@Injectable()
export class PopularityService {
  private readonly logger = new Logger(PopularityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: MercadoLivreClient,
  ) {}

  async refreshActive(now: Date = new Date()): Promise<PopularityReport> {
    const products = await this.prisma.product.findMany({
      where: { active: true, categoryId: { not: null } },
      select: { id: true, marketplaceItemId: true, categoryId: true },
    });

    const byCategory = new Map<string, typeof products>();
    for (const product of products) {
      const list = byCategory.get(product.categoryId as string) ?? [];
      list.push(product);
      byCategory.set(product.categoryId as string, list);
    }

    const report: PopularityReport = {
      categories: byCategory.size,
      productsChecked: 0,
      productsRanked: 0,
      failedCategories: [],
    };

    for (const [categoryId, categoryProducts] of byCategory) {
      let positions: Map<string, number>;

      try {
        positions = await this.rankingFor(categoryId);
      } catch (error) {
        report.failedCategories.push({
          categoryId,
          reason: error instanceof MercadoLivreError ? error.failure : 'unexpected_error',
        });
        continue;
      }

      for (const product of categoryProducts) {
        const position = positions.get(product.marketplaceItemId) ?? null;

        await this.prisma.product.update({
          where: { id: product.id },
          data: { highlightPosition: position, highlightCheckedAt: now },
        });

        report.productsChecked += 1;
        if (position !== null) report.productsRanked += 1;
      }
    }

    this.logger.log(
      JSON.stringify({
        provider: 'mercado_livre',
        operation: 'refresh_popularity',
        categories: report.categories,
        productsChecked: report.productsChecked,
        productsRanked: report.productsRanked,
        failedCategories: report.failedCategories.length,
      }),
    );

    return report;
  }

  /** Mapa itemId -> posicao. Entradas de catalogo entram pelo buy box winner. */
  private async rankingFor(categoryId: string): Promise<Map<string, number>> {
    const highlights = await this.client.getCategoryHighlights(categoryId);
    const positions = new Map<string, number>();

    (highlights.content ?? []).forEach((entry, index) => {
      if (entry.type !== 'PRODUCT') {
        positions.set(entry.id, entry.position ?? index + 1);
      }
    });

    return positions;
  }
}
