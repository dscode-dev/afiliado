export interface ProductRefreshSummary {
  synced: number;
  syncUnchanged: number;
  syncFailed: number;
  popularityChecked: number;
  popularityRanked: number;
  popularityFailedCategories: number;
}

export interface AffiliateGenerationSummary {
  /** Produtos ativos sem link no inicio da etapa. */
  total: number;
  generated: number;
  unchanged: number;
  failed: number;
  /** Sessao da Central caida: um operador precisa reautenticar. */
  authRequired: number;
}

export interface EvaluationSummary {
  evaluated: number;
  approved: number;
  candidate: number;
  ignored: number;
  notEligible: number;
  evaluationFailed: number;
}

import { ChannelType } from '@prisma/client';

export interface DistributionSummary {
  /** Oportunidades que passaram por score, idade e link afiliado. */
  eligible: number;
  published: number;
  publishFailed: number;
  /** Adiadas: limite do canal, janela de horario ou autopilot desligado. */
  deferred: number;
  /** Por que houve adiamento, quando houve. */
  deferredReason: string | null;
  channels: {
    channelId: string;
    channelName: string;
    provider: ChannelType;
    published: number;
    deferred: number;
    remainingQuota: number;
  }[];
  failures: { offerId: string; channelId: string; provider: ChannelType; reason: string }[];
}

export interface CycleSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  phases: string[];
  productRefresh: ProductRefreshSummary | null;
  affiliateLinks: AffiliateGenerationSummary | null;
  evaluation: EvaluationSummary | null;
  distribution: DistributionSummary | null;
  /** Falhas de fase inteira (ex.: Mercado Livre fora do ar). */
  phaseFailures: { phase: string; reason: string }[];
}

export interface ProviderStatus {
  provider: ChannelType;
  autopilotEnabled: boolean;
  minScore: number;
  maxPostsPerHour: number;
  maxPostsPerDay: number;
}

export interface AutomationStatus {
  /** Verdadeiro quando ao menos um destino tem publicacao automatica ligada. */
  autopilotEnabled: boolean;
  /** Estado por destino: cada um e opt-in independente. */
  providers: ProviderStatus[];
  schedulerEnabled: boolean;
  running: boolean;
  runningPhase: string | null;
  lastRunAt: string | null;
  lastResult: CycleSummary | null;
  nextRunAt: {
    productRefresh: string | null;
    evaluation: string | null;
    distribution: string | null;
  };
  limits: {
    maxOfferAgeHours: number;
    publishWindow: string;
    timezone: string;
    withinPublishWindow: boolean;
  };
}
