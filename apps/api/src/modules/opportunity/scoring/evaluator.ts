import { OpportunityStatus, Prisma } from '@prisma/client';
import {
  ComponentResult,
  PriceHistoryStats,
  scoreDiscount,
  scoreFreshness,
  scorePopularity,
  scorePriceHistory,
  scoreSeller,
} from './components';
import { COMPONENT_MAX, ComponentName, MAX_SCORE, thresholds } from './weights';

/** Tudo que o engine precisa saber. Nenhuma chamada externa acontece aqui. */
export interface EvaluationInput {
  currentPrice: Prisma.Decimal;
  originalPrice: Prisma.Decimal | null;
  history: PriceHistoryStats;
  historyWindowDays: number;
  lastPriceChangeAt: Date | null;
  lastMovement: 'down' | 'up' | 'unknown';
  lastSyncedAt: Date | null;
  highlightPosition: number | null;
  highlightCheckedAt: Date | null;
  sellerReputationLevel: string | null;
  sellerStatus: string | null;
  /** Regra fundamental: sem link afiliado ativo nao ha elegibilidade. */
  hasActiveAffiliateLink: boolean;
  now: Date;
}

export type Breakdown = Record<ComponentName, { earned: number; max: number }>;

export interface Evaluation {
  score: number;
  status: OpportunityStatus;
  breakdown: Breakdown;
  reasons: string[];
  evaluatedAt: Date;
}

/**
 * Avalia um produto de forma deterministica: a mesma entrada produz sempre a
 * mesma saida. O score sempre reflete a qualidade da oferta; a elegibilidade
 * (link afiliado) e uma porta separada, aplicada depois.
 */
export function evaluate(input: EvaluationInput): Evaluation {
  const components: ComponentResult[] = [
    scoreDiscount({ currentPrice: input.currentPrice, originalPrice: input.originalPrice }),
    scorePriceHistory({
      currentPrice: input.currentPrice,
      stats: input.history,
      windowDays: input.historyWindowDays,
    }),
    scorePopularity({
      highlightPosition: input.highlightPosition,
      highlightCheckedAt: input.highlightCheckedAt,
      now: input.now,
    }),
    scoreSeller({
      reputationLevel: input.sellerReputationLevel,
      sellerStatus: input.sellerStatus,
    }),
    scoreFreshness({
      lastPriceChangeAt: input.lastPriceChangeAt,
      lastMovement: input.lastMovement,
      lastSyncedAt: input.lastSyncedAt,
      now: input.now,
    }),
  ];

  const score = components.reduce((total, component) => total + component.earned, 0);
  const reasons = components.map((component) => component.reason);

  return {
    score,
    status: resolveStatus(score, input.hasActiveAffiliateLink),
    breakdown: toBreakdown(components),
    reasons: input.hasActiveAffiliateLink
      ? reasons
      : ['Produto sem link de afiliado ativo - nao elegivel para publicacao', ...reasons],
    evaluatedAt: input.now,
  };
}

/**
 * A ausencia de link afiliado ativo vence qualquer score: publicar sem link e
 * trabalho sem retorno. Nem o operador sobrepoe esta regra.
 */
function resolveStatus(score: number, hasActiveAffiliateLink: boolean): OpportunityStatus {
  if (!hasActiveAffiliateLink) return OpportunityStatus.NOT_ELIGIBLE;

  const { approved, candidate } = thresholds();

  if (score >= approved) return OpportunityStatus.APPROVED;
  if (score >= candidate) return OpportunityStatus.CANDIDATE;

  return OpportunityStatus.IGNORE;
}

function toBreakdown(components: ComponentResult[]): Breakdown {
  const breakdown = {} as Breakdown;

  for (const name of Object.keys(COMPONENT_MAX) as ComponentName[]) {
    const component = components.find((candidate) => candidate.name === name);
    breakdown[name] = { earned: component?.earned ?? 0, max: COMPONENT_MAX[name] };
  }

  return breakdown;
}

export { MAX_SCORE };
