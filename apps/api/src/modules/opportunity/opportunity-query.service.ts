import { Injectable } from '@nestjs/common';
import {
  OfferStatus,
  OperatorDecision,
  OpportunityStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toMoneyString } from '../../common/money';
import { Paginated, paginationArgs } from '../../common/dto/pagination.dto';
import { EffectiveStatus, resolveEffectiveStatus } from './effective-status';
import { Breakdown } from './scoring/evaluator';
import { ListOpportunitiesQueryDto } from './dto/list-opportunities.dto';

export interface OpportunityView {
  productId: string;
  title: string;
  category: string | null;
  permalink: string | null;
  imageUrl: string | null;
  price: string;
  originalPrice: string | null;
  score: number;
  status: OpportunityStatus;
  operatorDecision: OperatorDecision | null;
  operatorDecidedAt: string | null;
  operatorNote: string | null;
  effectiveStatus: EffectiveStatus;
  breakdown: Breakdown;
  reasons: string[];
  evaluatedAt: string;
  /** Falso => o admin mostra LINK REQUIRED e oferece cadastrar o link. */
  hasActiveAffiliateLink: boolean;
  affiliateLinkUrl: string | null;
  offerId: string | null;
  offerStatus: OfferStatus | null;
}

@Injectable()
export class OpportunityQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListOpportunitiesQueryDto): Promise<Paginated<OpportunityView>> {
    const { take, skip } = paginationArgs(query);

    const where: Prisma.OpportunityEvaluationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.minScore === undefined ? {} : { score: { gte: query.minScore } }),
      ...(query.category
        ? { product: { category: { contains: query.category, mode: 'insensitive' } } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.opportunityEvaluation.findMany({
        where,
        take,
        skip,
        orderBy: [{ score: 'desc' }, { evaluatedAt: 'desc' }],
        include: {
          product: {
            include: {
              affiliateLinks: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } },
              offers: { orderBy: { detectedAt: 'desc' }, take: 1 },
            },
          },
        },
      }),
      this.prisma.opportunityEvaluation.count({ where }),
    ]);

    return { data: rows.map(toOpportunityView), total, take, skip };
  }
}

type EvaluationRow = Prisma.OpportunityEvaluationGetPayload<{
  include: {
    product: {
      include: { affiliateLinks: true; offers: true };
    };
  };
}>;

function toOpportunityView(row: EvaluationRow): OpportunityView {
  const link = row.product.affiliateLinks[0] ?? null;
  const offer = row.product.offers[0] ?? null;

  return {
    productId: row.productId,
    title: row.product.title,
    category: row.product.category,
    permalink: row.product.permalink,
    imageUrl: row.product.imageUrl,
    price: toMoneyString(row.product.currentPrice) as string,
    originalPrice: toMoneyString(row.product.originalPrice),
    score: row.score,
    status: row.status,
    operatorDecision: row.operatorDecision,
    operatorDecidedAt: row.operatorDecidedAt?.toISOString() ?? null,
    operatorNote: row.operatorNote,
    effectiveStatus: resolveEffectiveStatus(row.status, row.operatorDecision),
    breakdown: row.breakdown as unknown as Breakdown,
    reasons: row.reasons,
    evaluatedAt: row.evaluatedAt.toISOString(),
    hasActiveAffiliateLink: link !== null,
    affiliateLinkUrl: link?.url ?? null,
    offerId: offer?.id ?? null,
    offerStatus: offer?.status ?? null,
  };
}

