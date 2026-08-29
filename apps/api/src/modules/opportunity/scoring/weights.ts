/**
 * Pesos e limiares do Opportunity Engine.
 *
 * Constantes versionadas em codigo de proposito: sao regra de negocio revisada
 * em code review, nao configuracao de ambiente. Apenas os limiares de decisao
 * e o cooldown vem de environment variables, porque variam por operacao.
 */

export const COMPONENT_MAX = {
  discount: 35,
  priceHistory: 25,
  popularity: 20,
  seller: 10,
  freshness: 10,
} as const;

export type ComponentName = keyof typeof COMPONENT_MAX;

/** A soma dos componentes e exatamente 100. Garantido por teste. */
export const MAX_SCORE = 100;

/** Janela do historico considerada pelo componente de preco. */
export const HISTORY_WINDOW_DAYS = Number(process.env.OPPORTUNITY_HISTORY_WINDOW_DAYS ?? 30);

/** Popularidade verificada ha mais tempo que isto e tratada como desconhecida. */
export const POPULARITY_STALE_DAYS = 7;

/** Sincronizacao mais antiga que isto limita o score de freshness. */
export const SYNC_STALE_DAYS = 7;

export interface Thresholds {
  approved: number;
  candidate: number;
  cooldownHours: number;
}

/**
 * Limiares de decisao. Lidos do ambiente a cada leitura para que os testes
 * possam exercitar configuracoes diferentes sem reiniciar o processo.
 */
export function thresholds(): Thresholds {
  return {
    approved: Number(process.env.OPPORTUNITY_APPROVED_THRESHOLD ?? 85),
    candidate: Number(process.env.OPPORTUNITY_CANDIDATE_THRESHOLD ?? 70),
    cooldownHours: Number(process.env.OPPORTUNITY_COOLDOWN_HOURS ?? 24),
  };
}
