export interface ProductRefreshSummary {
  synced: number;
  syncUnchanged: number;
  syncFailed: number;
  popularityChecked: number;
  popularityRanked: number;
  popularityFailedCategories: number;
}

export interface EvaluationSummary {
  evaluated: number;
  approved: number;
  candidate: number;
  ignored: number;
  notEligible: number;
  evaluationFailed: number;
}

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
    published: number;
    deferred: number;
    remainingQuota: number;
  }[];
  failures: { offerId: string; channelId: string; reason: string }[];
}

export interface CycleSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  phases: string[];
  productRefresh: ProductRefreshSummary | null;
  evaluation: EvaluationSummary | null;
  distribution: DistributionSummary | null;
  /** Falhas de fase inteira (ex.: Mercado Livre fora do ar). */
  phaseFailures: { phase: string; reason: string }[];
}

export interface AutomationStatus {
  /** Publicacao automatica habilitada (TELEGRAM_AUTO_PUBLISH_ENABLED). */
  autopilotEnabled: boolean;
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
    minScore: number;
    maxPostsPerHour: number;
    maxPostsPerDay: number;
    maxOfferAgeHours: number;
    publishWindow: string;
    timezone: string;
    withinPublishWindow: boolean;
  };
}
