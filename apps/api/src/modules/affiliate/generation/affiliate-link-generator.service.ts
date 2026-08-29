import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AffiliateLinkSource, Product } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  AffiliateBotClient,
  AffiliateGenerationError,
  GenerationFailure,
} from './affiliate-bot.client';
import { validateGeneratedLink } from './link-validator';

export type GenerationOutcome = 'created' | 'rotated' | 'unchanged' | 'skipped';

export interface GenerationResult {
  productId: string;
  outcome: GenerationOutcome;
  /** URL do link ativo. Sempre de afiliado - nunca o permalink. */
  url: string;
  tag: string | null;
}

export interface BatchGenerationReport {
  total: number;
  generated: number;
  unchanged: number;
  failed: number;
  authRequired: number;
  failures: { productId: string; reason: GenerationFailure | 'unexpected_error' }[];
}

/** Concorrencia baixa de proposito: a Central e um site, nao uma API. */
const DEFAULT_CONCURRENCY = 3;

/**
 * Transforma um Product em AffiliateLink, sozinho.
 *
 * Responsabilidade unica: `Product.permalink` -> URL de afiliado persistida.
 * Nao conhece Opportunity Engine nem distribuicao.
 *
 * Fail-closed: se a geracao falhar, o produto simplesmente fica sem link e
 * nao e publicado. O permalink comum NUNCA vira link de publicacao.
 */
@Injectable()
export class AffiliateLinkGeneratorService {
  private readonly logger = new Logger(AffiliateLinkGeneratorService.name);
  private readonly concurrency: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: AffiliateBotClient,
  ) {
    this.concurrency = Math.max(
      1,
      Math.min(Number(process.env.AFFILIATE_GENERATION_CONCURRENCY ?? DEFAULT_CONCURRENCY), 5),
    );
  }

  /**
   * Garante um link ativo para o produto.
   *
   * Idempotente: com um link automatico ativo e valido, nao chama o provider.
   */
  async ensureForProduct(productId: string): Promise<GenerationResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        affiliateLinks: {
          where: { active: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) throw new NotFoundException(`Produto ${productId} nao encontrado`);

    const existing = product.affiliateLinks[0];

    // Link manual do operador tem precedencia: nao sobrescrevemos trabalho humano.
    if (existing) {
      return {
        productId,
        outcome: 'unchanged',
        url: existing.url,
        tag: existing.tag,
      };
    }

    return this.generateFor(product);
  }

  /** Força a geracao, mesmo com link ativo (rotacao controlada). */
  async regenerateForProduct(productId: string): Promise<GenerationResult> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });

    if (!product) throw new NotFoundException(`Produto ${productId} nao encontrado`);

    return this.generateFor(product);
  }

  /**
   * Gera para todos os produtos ativos sem link.
   * Uma falha nao interrompe o lote.
   */
  async generateMissing(): Promise<BatchGenerationReport> {
    const products = await this.prisma.product.findMany({
      where: { active: true, affiliateLinks: { none: { active: true } } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const report: BatchGenerationReport = {
      total: products.length,
      generated: 0,
      unchanged: 0,
      failed: 0,
      authRequired: 0,
      failures: [],
    };

    const queue = [...products];

    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        try {
          const result = await this.ensureForProduct(next.id);

          if (result.outcome === 'unchanged') report.unchanged += 1;
          else report.generated += 1;
        } catch (error) {
          const reason =
            error instanceof AffiliateGenerationError ? error.failure : 'unexpected_error';

          report.failed += 1;
          if (reason === 'AUTH_REQUIRED') report.authRequired += 1;
          report.failures.push({ productId: next.id, reason });

          // Sessao caida: insistir nos demais so gastaria tempo.
          if (reason === 'AUTH_REQUIRED') {
            queue.length = 0;
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.concurrency, queue.length) }, worker));

    this.logger.log(
      JSON.stringify({
        provider: 'affiliate_bot',
        operation: 'generate_missing',
        total: report.total,
        generated: report.generated,
        failed: report.failed,
        authRequired: report.authRequired,
      }),
    );

    return report;
  }

  private async generateFor(product: Product): Promise<GenerationResult> {
    if (!product.permalink) {
      throw new AffiliateGenerationError(
        'INVALID_LINK',
        'Produto sem permalink: nao ha o que transformar em link de afiliado',
      );
    }

    const status = await this.bot.status();

    if (status.status !== 'READY' || !status.tag) {
      throw new AffiliateGenerationError(
        status.status === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'UNAVAILABLE',
        status.status === 'AUTH_REQUIRED'
          ? 'Sessao da Central de Afiliados expirada. Rode `npm run affiliate:login`.'
          : 'affiliate-bot indisponivel',
      );
    }

    const generated = await this.bot.generate(product.permalink);

    // Fail-closed: link invalido nao e persistido, e nada substitui o permalink.
    validateGeneratedLink({
      url: generated.url,
      originUrl: generated.originUrl,
      tag: generated.tag,
      expectedTag: status.tag,
      productPermalink: product.permalink,
    });

    const now = new Date();

    // Um link ativo por produto e origem automatica: os antigos sao desativados
    // em vez de acumular.
    const outcome = await this.prisma.$transaction(async (tx) => {
      const current = await tx.affiliateLink.findFirst({
        where: { productId: product.id, active: true, source: AffiliateLinkSource.MERCADO_LIVRE_AFFILIATE_WEB },
      });

      if (current?.url === generated.url) {
        await tx.affiliateLink.update({
          where: { id: current.id },
          data: { verifiedAt: now, tag: generated.tag, originUrl: generated.originUrl },
        });

        return 'unchanged' as const;
      }

      if (current) {
        await tx.affiliateLink.update({ where: { id: current.id }, data: { active: false } });
      }

      await tx.affiliateLink.create({
        data: {
          productId: product.id,
          url: generated.url,
          source: AffiliateLinkSource.MERCADO_LIVRE_AFFILIATE_WEB,
          tag: generated.tag,
          originUrl: generated.originUrl,
          sourceLabel: 'affiliate-bot',
          generatedAt: now,
          verifiedAt: now,
          active: true,
        },
      });

      return current ? ('rotated' as const) : ('created' as const);
    });

    this.logger.log(
      JSON.stringify({
        provider: 'affiliate_bot',
        operation: 'generate_link',
        productId: product.id,
        outcome,
        tag: generated.tag,
      }),
    );

    return { productId: product.id, outcome, url: generated.url, tag: generated.tag };
  }
}
