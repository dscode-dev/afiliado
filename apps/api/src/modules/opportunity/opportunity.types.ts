import { OperatorDecision, OpportunityStatus, Prisma } from '@prisma/client';
import { EffectiveStatus } from './effective-status';
import { Breakdown } from './scoring/evaluator';

export interface EvaluationResult {
  productId: string;
  productTitle: string;
  price: string;
  score: number;
  /** Recomendacao do engine, derivada apenas do score e da elegibilidade. */
  status: OpportunityStatus;
  /** Decisao humana registrada, quando existir. */
  operatorDecision: OperatorDecision | null;
  /** O que vale na pratica: decisao humana quando houver, senao o engine. */
  effectiveStatus: EffectiveStatus;
  breakdown: Breakdown;
  reasons: string[];
  evaluatedAt: string;
  offerId: string | null;
  offerCreated: boolean;
  /** Oportunidade identica ja gerada dentro da janela de cooldown. */
  suppressedByCooldown: boolean;
}

export interface BatchEvaluationReport {
  total: number;
  approved: number;
  candidate: number;
  ignored: number;
  notEligible: number;
  failed: number;
  offersCreated: number;
  failures: { productId: string; reason: string }[];
}

export interface PriceWindow {
  samples: number;
  min: Prisma.Decimal | null;
  max: Prisma.Decimal | null;
  average: Prisma.Decimal | null;
  lastChangeAt: Date | null;
  lastMovement: 'down' | 'up' | 'unknown';
}
