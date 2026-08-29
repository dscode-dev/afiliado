import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  OfferStatus,
  OperatorDecision,
  OpportunityStatus,
  Prisma,
  PriceSnapshot,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toMoneyString } from '../../common/money';
import { resolveEffectiveStatus } from './effective-status';
import { Evaluation, evaluate } from './scoring/evaluator';
import { HISTORY_WINDOW_DAYS, thresholds } from './scoring/weights';
import { BatchEvaluationReport, EvaluationResult, PriceWindow } from './opportunity.types';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Statuses do engine que geram uma Offer. */
const OFFER_WORTHY: OpportunityStatus[] = [
  OpportunityStatus.APPROVED,
  OpportunityStatus.CANDIDATE,
];

@Injectable()
export class OpportunityService {
  private readonly logger = new Logger(OpportunityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Avalia um produto e aplica a politica de Offer. */
  async evaluateProduct(productId: string, now: Date = new Date()): Promise<EvaluationResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { evaluation: true },
    });

    if (!product) {
      throw new NotFoundException(`Produto ${productId} nao encontrado`);
    }

    const [activeLinks, snapshots] = await Promise.all([
      this.prisma.affiliateLink.count({ where: { productId, active: true } }),
      this.prisma.priceSnapshot.findMany({
        where: { productId, capturedAt: { gte: new Date(now.getTime() - HISTORY_WINDOW_DAYS * DAY_MS) } },
        orderBy: { capturedAt: 'desc' },
      }),
    ]);

    const window = summarize(snapshots);

    const evaluation = evaluate({
      currentPrice: product.currentPrice,
      originalPrice: product.originalPrice,
      history: { samples: window.samples, min: window.min, max: window.max, average: window.average },
      historyWindowDays: HISTORY_WINDOW_DAYS,
      lastPriceChangeAt: window.lastChangeAt,
      lastMovement: window.lastMovement,
      lastSyncedAt: product.lastSyncedAt,
      highlightPosition: product.highlightPosition,
      highlightCheckedAt: product.highlightCheckedAt,
      sellerReputationLevel: product.sellerReputationLevel,
      sellerStatus: product.sellerStatus,
      hasActiveAffiliateLink: activeLinks > 0,
      now,
    });

    // A decisao humana anterior sobrevive a reavaliacao: o engine nunca a apaga.
    const operatorDecision = product.evaluation?.operatorDecision ?? null;

    await this.persistEvaluation(productId, evaluation);

    const offer = await this.applyOfferPolicy(
      productId,
      product.currentPrice,
      product.originalPrice,
      evaluation.status,
      operatorDecision,
      now,
    );

    return {
      productId,
      productTitle: product.title,
      price: toMoneyString(product.currentPrice) as string,
      score: evaluation.score,
      status: evaluation.status,
      operatorDecision,
      effectiveStatus: resolveEffectiveStatus(evaluation.status, operatorDecision),
      breakdown: evaluation.breakdown,
      reasons: evaluation.reasons,
      evaluatedAt: evaluation.evaluatedAt.toISOString(),
      ...offer,
    };
  }

  /**
   * Avalia todos os produtos ativos. A falha de um produto e registrada e nao
   * interrompe os demais.
   */
  async evaluateActive(now: Date = new Date()): Promise<BatchEvaluationReport> {
    const products = await this.prisma.product.findMany({
      where: { active: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const report: BatchEvaluationReport = {
      total: products.length,
      approved: 0,
      candidate: 0,
      ignored: 0,
      notEligible: 0,
      failed: 0,
      offersCreated: 0,
      failures: [],
    };

    // Sequencial de proposito: e trabalho de banco, sem chamada externa.
    for (const product of products) {
      try {
        const result = await this.evaluateProduct(product.id, now);

        if (result.offerCreated) report.offersCreated += 1;

        if (result.status === OpportunityStatus.APPROVED) report.approved += 1;
        else if (result.status === OpportunityStatus.CANDIDATE) report.candidate += 1;
        else if (result.status === OpportunityStatus.NOT_ELIGIBLE) report.notEligible += 1;
        else report.ignored += 1;
      } catch (error) {
        report.failed += 1;
        report.failures.push({
          productId: product.id,
          reason: error instanceof Error ? error.message : 'unexpected_error',
        });
        this.logger.error(
          JSON.stringify({ operation: 'evaluate_active', productId: product.id, failed: true }),
        );
      }
    }

    this.logger.log(JSON.stringify({ operation: 'evaluate_active', ...counts(report) }));

    return report;
  }

  /**
   * Registra uma decisao humana. Nao altera o score: engine e operador sao
   * conceitos separados e ambos ficam visiveis.
   */
  async decide(
    productId: string,
    decision: OperatorDecision | null,
    note: string | undefined,
    now: Date = new Date(),
  ): Promise<EvaluationResult> {
    const existing = await this.prisma.opportunityEvaluation.findUnique({ where: { productId } });

    if (!existing) {
      throw new NotFoundException(
        `Produto ${productId} ainda nao foi avaliado. Avalie antes de decidir.`,
      );
    }

    await this.prisma.opportunityEvaluation.update({
      where: { productId },
      data: {
        operatorDecision: decision,
        operatorDecidedAt: decision ? now : null,
        operatorNote: decision ? (note ?? null) : null,
      },
    });

    // Reavalia para que a decisao humana seja refletida imediatamente na Offer.
    return this.evaluateProduct(productId, now);
  }

  private async persistEvaluation(productId: string, evaluation: Evaluation): Promise<void> {
    const data = {
      score: evaluation.score,
      status: evaluation.status,
      breakdown: evaluation.breakdown as unknown as Prisma.InputJsonValue,
      reasons: evaluation.reasons,
      evaluatedAt: evaluation.evaluatedAt,
    };

    await this.prisma.opportunityEvaluation.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    });
  }

  /**
   * Politica de Offer:
   * - a identidade de uma oportunidade e (produto, preco);
   * - APPROVED/CANDIDATE geram ou atualizam a Offer daquele preco;
   * - IGNORE/NOT_ELIGIBLE nunca criam Offer nova;
   * - uma Offer ja aprovada dentro do cooldown nao e tocada novamente.
   */
  private async applyOfferPolicy(
    productId: string,
    price: Prisma.Decimal,
    originalPrice: Prisma.Decimal | null,
    engineStatus: OpportunityStatus,
    operatorDecision: OperatorDecision | null,
    now: Date,
  ): Promise<{ offerId: string | null; offerCreated: boolean; suppressedByCooldown: boolean }> {
    const existing = await this.prisma.offer.findUnique({
      where: { productId_price: { productId, price } },
    });

    // Sem link afiliado ativo nada e gerado, mesmo com decisao humana.
    if (engineStatus === OpportunityStatus.NOT_ELIGIBLE) {
      return { offerId: existing?.id ?? null, offerCreated: false, suppressedByCooldown: false };
    }

    if (operatorDecision === OperatorDecision.REJECTED) {
      if (!existing) {
        return { offerId: null, offerCreated: false, suppressedByCooldown: false };
      }

      const rejected = await this.prisma.offer.update({
        where: { id: existing.id },
        data: { status: OfferStatus.REJECTED },
      });

      return { offerId: rejected.id, offerCreated: false, suppressedByCooldown: false };
    }

    const target = targetOfferStatus(engineStatus, operatorDecision);

    if (!target) {
      return { offerId: existing?.id ?? null, offerCreated: false, suppressedByCooldown: false };
    }

    if (!existing) {
      const created = await this.prisma.offer.create({
        data: {
          productId,
          price,
          originalPrice,
          discountPercentage: discountOf(price, originalPrice),
          status: target,
          detectedAt: now,
        },
      });

      return { offerId: created.id, offerCreated: true, suppressedByCooldown: false };
    }

    // Cooldown: a mesma oportunidade ja aprovada ha pouco nao e reprocessada.
    const cooldownMs = thresholds().cooldownHours * HOUR_MS;
    const withinCooldown = now.getTime() - existing.updatedAt.getTime() < cooldownMs;

    if (existing.status === OfferStatus.APPROVED && withinCooldown) {
      return { offerId: existing.id, offerCreated: false, suppressedByCooldown: true };
    }

    const updated = await this.prisma.offer.update({
      where: { id: existing.id },
      data: {
        originalPrice,
        discountPercentage: discountOf(price, originalPrice),
        status: target,
      },
    });

    return { offerId: updated.id, offerCreated: false, suppressedByCooldown: false };
  }
}

function targetOfferStatus(
  engineStatus: OpportunityStatus,
  operatorDecision: OperatorDecision | null,
): OfferStatus | null {
  if (operatorDecision === OperatorDecision.APPROVED) return OfferStatus.APPROVED;
  if (!OFFER_WORTHY.includes(engineStatus)) return null;

  return engineStatus === OpportunityStatus.APPROVED
    ? OfferStatus.APPROVED
    : OfferStatus.CANDIDATE;
}

function discountOf(
  price: Prisma.Decimal,
  originalPrice: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (!originalPrice || originalPrice.lessThanOrEqualTo(price)) return null;

  return originalPrice.minus(price).dividedBy(originalPrice).times(100).toDecimalPlaces(2);
}

/**
 * Estatisticas da janela. Snapshots so existem quando o preco muda, entao o
 * mais recente marca a ultima mudanca de preco.
 */
function summarize(snapshots: PriceSnapshot[]): PriceWindow {
  if (snapshots.length === 0) {
    return { samples: 0, min: null, max: null, average: null, lastChangeAt: null, lastMovement: 'unknown' };
  }

  let min = snapshots[0].price;
  let max = snapshots[0].price;
  let sum = new Prisma.Decimal(0);

  for (const snapshot of snapshots) {
    if (snapshot.price.lessThan(min)) min = snapshot.price;
    if (snapshot.price.greaterThan(max)) max = snapshot.price;
    sum = sum.plus(snapshot.price);
  }

  const lastMovement =
    snapshots.length < 2
      ? 'unknown'
      : snapshots[0].price.lessThan(snapshots[1].price)
        ? 'down'
        : 'up';

  return {
    samples: snapshots.length,
    min,
    max,
    average: sum.dividedBy(snapshots.length).toDecimalPlaces(2),
    lastChangeAt: snapshots[0].capturedAt,
    lastMovement,
  };
}

function counts(report: BatchEvaluationReport): Record<string, number> {
  return {
    total: report.total,
    approved: report.approved,
    candidate: report.candidate,
    ignored: report.ignored,
    notEligible: report.notEligible,
    failed: report.failed,
  };
}
