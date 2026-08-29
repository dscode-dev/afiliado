import { Injectable } from '@nestjs/common';
import { ChannelType, OpportunityStatus, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveEffectiveStatus } from '../opportunity/effective-status';
import { AutomationConfig } from './automation.config';
import { Clock } from './clock';

export interface DistributionCandidate {
  offerId: string;
  productId: string;
  productTitle: string;
  score: number;
  detectedAt: Date;
}

export interface ChannelQuota {
  channelId: string;
  channelName: string;
  type: ChannelType;
  /** Quantas publicacoes ainda cabem agora, considerando hora e dia. */
  remaining: number;
  publishedLastHour: number;
  publishedLastDay: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Decide o que pode ser publicado automaticamente.
 *
 * Nao reimplementa regras do Opportunity Engine nem o cooldown: consome o
 * `effectiveStatus` do PR-03 e depende da idempotencia `(offer, canal)` do
 * PR-04. Aqui vivem apenas as regras proprias do autopilot - score minimo,
 * idade da oferta, ranking e limites por canal.
 */
@Injectable()
export class DistributionPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AutomationConfig,
    private readonly clock: Clock,
  ) {}

  /**
   * Oportunidades elegiveis, das melhores para as piores.
   *
   * Ordem: score DESC, depois oferta mais recente primeiro (freshness).
   */
  async selectCandidates(): Promise<DistributionCandidate[]> {
    const now = this.clock.now();
    const oldestAllowed = new Date(now.getTime() - this.config.maxOfferAgeHours * HOUR_MS);

    const evaluations = await this.prisma.opportunityEvaluation.findMany({
      where: {
        // Filtro amplo: o score minimo fino e por provider, aplicado por canal.
        score: { gte: this.config.selectionMinScore },
        // NOT_ELIGIBLE nunca e publicavel; os demais dependem da decisao humana.
        status: { not: OpportunityStatus.NOT_ELIGIBLE },
      },
      include: {
        product: {
          include: {
            affiliateLinks: { where: { active: true }, take: 1 },
            offers: { orderBy: { detectedAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: [{ score: 'desc' }, { evaluatedAt: 'desc' }],
    });

    const candidates: DistributionCandidate[] = [];

    for (const evaluation of evaluations) {
      const effective = resolveEffectiveStatus(evaluation.status, evaluation.operatorDecision);
      if (effective !== OpportunityStatus.APPROVED) continue;

      // AffiliateLink ativo continua obrigatorio, sem excecao e sem fallback.
      if (evaluation.product.affiliateLinks.length === 0) continue;

      const offer = evaluation.product.offers[0];
      if (!offer) continue;

      // Oferta velha nao entra no autopilot; segue publicavel manualmente.
      if (offer.detectedAt < oldestAllowed) continue;

      candidates.push({
        offerId: offer.id,
        productId: evaluation.productId,
        productTitle: evaluation.product.title,
        score: evaluation.score,
        detectedAt: offer.detectedAt,
      });
    }

    return candidates.sort(
      (a, b) => b.score - a.score || b.detectedAt.getTime() - a.detectedAt.getTime(),
    );
  }

  /**
   * Canais ativos, prontos para publicar, dos tipos suportados e com
   * publicacao automatica habilitada.
   */
  async activePublishableChannels(supportedTypes: ChannelType[]) {
    const enabled = supportedTypes.filter((type) => this.config.policyFor(type).enabled);

    if (enabled.length === 0) return [];

    return this.prisma.channel.findMany({
      where: {
        type: { in: enabled },
        active: true,
        externalIdentifier: { not: null },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Quanto ainda cabe neste canal, pelos limites do provider dele.
   *
   * Conta apenas publicacoes bem-sucedidas: uma tentativa que falhou nao
   * consome cota. Limites sao por canal, entao Telegram e Facebook nunca
   * disputam a mesma quota.
   */
  async quotaFor(
    channelId: string,
    channelName: string,
    type: ChannelType,
  ): Promise<ChannelQuota> {
    const now = this.clock.now();
    const policy = this.config.policyFor(type);

    const [publishedLastHour, publishedLastDay] = await Promise.all([
      this.prisma.publication.count({
        where: {
          channelId,
          status: PublicationStatus.PUBLISHED,
          publishedAt: { gte: new Date(now.getTime() - HOUR_MS) },
        },
      }),
      this.prisma.publication.count({
        where: {
          channelId,
          status: PublicationStatus.PUBLISHED,
          publishedAt: { gte: new Date(now.getTime() - DAY_MS) },
        },
      }),
    ]);

    const remaining = Math.max(
      0,
      Math.min(
        policy.maxPostsPerHour - publishedLastHour,
        policy.maxPostsPerDay - publishedLastDay,
      ),
    );

    return { channelId, channelName, type, remaining, publishedLastHour, publishedLastDay };
  }

  /** Ofertas ja publicadas neste canal - ficam de fora da selecao. */
  async alreadyPublishedOfferIds(channelId: string, offerIds: string[]): Promise<Set<string>> {
    if (offerIds.length === 0) return new Set();

    const rows = await this.prisma.publication.findMany({
      where: { channelId, offerId: { in: offerIds } },
      select: { offerId: true },
    });

    return new Set(rows.map((row) => row.offerId));
  }
}
