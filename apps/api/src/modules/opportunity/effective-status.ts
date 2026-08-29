import { OfferStatus, OperatorDecision, OpportunityStatus } from '@prisma/client';

/**
 * O que vale na pratica para uma oportunidade: a decisao humana quando existir,
 * senao a recomendacao do engine.
 *
 * Fonte unica da verdade - `distribution` consome esta funcao em vez de
 * reimplementar as regras do Opportunity Engine.
 */
export type EffectiveStatus = OpportunityStatus | OfferStatus;

export function resolveEffectiveStatus(
  engineStatus: OpportunityStatus,
  operatorDecision: OperatorDecision | null,
): EffectiveStatus {
  // A falta de link afiliado ativo vence qualquer decisao, inclusive a humana.
  if (engineStatus === OpportunityStatus.NOT_ELIGIBLE) return OpportunityStatus.NOT_ELIGIBLE;
  if (operatorDecision === OperatorDecision.APPROVED) return OpportunityStatus.APPROVED;
  if (operatorDecision === OperatorDecision.REJECTED) return OfferStatus.REJECTED;

  return engineStatus;
}

/** Somente uma oportunidade efetivamente aprovada pode ser publicada. */
export function isPublishable(effective: EffectiveStatus): boolean {
  return effective === OpportunityStatus.APPROVED;
}
