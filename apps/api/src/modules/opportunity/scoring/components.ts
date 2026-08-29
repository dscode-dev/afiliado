import { Prisma } from '@prisma/client';
import {
  COMPONENT_MAX,
  ComponentName,
  POPULARITY_STALE_DAYS,
  SYNC_STALE_DAYS,
} from './weights';

export interface ComponentResult {
  name: ComponentName;
  earned: number;
  max: number;
  reason: string;
}

const DAY_MS = 86_400_000;

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

function result(name: ComponentName, earned: number, reason: string): ComponentResult {
  return { name, earned, max: COMPONENT_MAX[name], reason };
}

// ---------------------------------------------------------------------------
// Desconto (0..35)
// ---------------------------------------------------------------------------

export interface DiscountInput {
  currentPrice: Prisma.Decimal;
  originalPrice: Prisma.Decimal | null;
}

/**
 * Desconto oficial informado pelo marketplace.
 *
 * Sozinho nao prova boa oferta - e apenas um dos cinco sinais. Um "preco de"
 * inflado rende pontos aqui, mas nao sustenta o score sem historico proprio.
 */
export function scoreDiscount({ currentPrice, originalPrice }: DiscountInput): ComponentResult {
  if (!originalPrice || originalPrice.lessThanOrEqualTo(currentPrice)) {
    return result('discount', 0, 'Sem desconto oficial informado');
  }

  const percentage = originalPrice
    .minus(currentPrice)
    .dividedBy(originalPrice)
    .times(100)
    .toNumber();

  const rounded = Math.round(percentage);
  const label = `Desconto oficial de ${rounded}%`;

  if (percentage >= 30) return result('discount', 35, label);
  if (percentage >= 20) return result('discount', 25, label);
  if (percentage >= 10) return result('discount', 16, label);
  if (percentage >= 1) return result('discount', 8, label);

  return result('discount', 0, 'Desconto oficial menor que 1%');
}

// ---------------------------------------------------------------------------
// Historico de preco (0..25)
// ---------------------------------------------------------------------------

export interface PriceHistoryStats {
  samples: number;
  min: Prisma.Decimal | null;
  max: Prisma.Decimal | null;
  average: Prisma.Decimal | null;
}

export interface PriceHistoryInput {
  currentPrice: Prisma.Decimal;
  stats: PriceHistoryStats;
  windowDays: number;
}

/** Teto aplicado quando conhecemos um unico ponto: nao da para comparar. */
export const SPARSE_HISTORY_CAP = 10;

/**
 * Compara o preco atual com o historico que nos mesmos coletamos.
 *
 * Degrada de forma previsivel: sem historico o componente vale 0, e com um
 * unico ponto o valor e limitado - um preco nao pode ser "o menor de todos"
 * quando ele e o unico que conhecemos.
 */
export function scorePriceHistory({
  currentPrice,
  stats,
  windowDays,
}: PriceHistoryInput): ComponentResult {
  if (stats.samples === 0 || !stats.min || !stats.average) {
    return result('priceHistory', 0, `Sem historico de preco nos ultimos ${windowDays} dias`);
  }

  const { earned, reason } = tierPriceHistory(currentPrice, stats, windowDays);

  if (stats.samples < 2) {
    return result(
      'priceHistory',
      Math.min(earned, SPARSE_HISTORY_CAP),
      `Historico insuficiente (1 ponto em ${windowDays} dias)`,
    );
  }

  return result('priceHistory', earned, reason);
}

function tierPriceHistory(
  current: Prisma.Decimal,
  stats: PriceHistoryStats,
  windowDays: number,
): { earned: number; reason: string } {
  const min = stats.min as Prisma.Decimal;
  const average = stats.average as Prisma.Decimal;
  const window = `${windowDays} dias`;

  if (current.lessThanOrEqualTo(min)) {
    return { earned: 25, reason: `Menor preco dos ultimos ${window}` };
  }
  if (current.lessThanOrEqualTo(min.times(1.02))) {
    return { earned: 22, reason: `Praticamente o menor preco dos ultimos ${window}` };
  }
  if (current.lessThanOrEqualTo(average.times(0.9))) {
    return { earned: 18, reason: `Bem abaixo da media dos ultimos ${window}` };
  }
  if (current.lessThan(average)) {
    return { earned: 13, reason: `Abaixo da media dos ultimos ${window}` };
  }
  if (current.lessThanOrEqualTo(average.times(1.05))) {
    return { earned: 7, reason: `Proximo da media dos ultimos ${window}` };
  }

  return { earned: 2, reason: `Acima da media dos ultimos ${window}` };
}

// ---------------------------------------------------------------------------
// Popularidade (0..20)
// ---------------------------------------------------------------------------

export interface PopularityInput {
  highlightPosition: number | null;
  highlightCheckedAt: Date | null;
  now: Date;
}

/**
 * Usa apenas o ranking oficial de mais vendidos ja coletado.
 *
 * Ausencia de dado vale 0, sem penalizacao adicional: o produto simplesmente
 * nao ganha estes pontos.
 */
export function scorePopularity({
  highlightPosition,
  highlightCheckedAt,
  now,
}: PopularityInput): ComponentResult {
  if (!highlightCheckedAt) {
    return result('popularity', 0, 'Popularidade ainda nao verificada');
  }

  if (daysBetween(highlightCheckedAt, now) > POPULARITY_STALE_DAYS) {
    return result(
      'popularity',
      0,
      `Popularidade verificada ha mais de ${POPULARITY_STALE_DAYS} dias`,
    );
  }

  if (highlightPosition === null) {
    return result('popularity', 0, 'Fora dos mais vendidos da categoria');
  }

  if (highlightPosition <= 3) {
    return result('popularity', 20, `Top ${highlightPosition} dos mais vendidos da categoria`);
  }
  if (highlightPosition <= 10) {
    return result('popularity', 15, `Posicao ${highlightPosition} nos mais vendidos`);
  }

  return result('popularity', 10, `Posicao ${highlightPosition} nos mais vendidos`);
}

// ---------------------------------------------------------------------------
// Vendedor (0..10)
// ---------------------------------------------------------------------------

export interface SellerInput {
  reputationLevel: string | null;
  sellerStatus: string | null;
}

/** Sem dado de vendedor o componente e neutro (metade), nunca zero. */
export const SELLER_NEUTRAL = 5;

const POWER_SELLER_POINTS: Record<string, number> = {
  platinum: 10,
  gold: 9,
  silver: 8,
};

const REPUTATION_POINTS: Record<string, number> = {
  '5_green': 8,
  '4_light_green': 6,
  '3_yellow': 4,
  '2_orange': 2,
  '1_red': 0,
};

export function scoreSeller({ reputationLevel, sellerStatus }: SellerInput): ComponentResult {
  const power = sellerStatus ? POWER_SELLER_POINTS[sellerStatus.toLowerCase()] : undefined;

  if (power !== undefined) {
    return result('seller', power, `Vendedor ${sellerStatus?.toLowerCase()}`);
  }

  const reputation = reputationLevel ? REPUTATION_POINTS[reputationLevel.toLowerCase()] : undefined;

  if (reputation !== undefined) {
    return result('seller', reputation, `Reputacao do vendedor: ${reputationLevel}`);
  }

  return result('seller', SELLER_NEUTRAL, 'Sem dados de reputacao do vendedor (neutro)');
}

// ---------------------------------------------------------------------------
// Freshness (0..10)
// ---------------------------------------------------------------------------

export interface FreshnessInput {
  /** Momento da ultima mudanca de preco observada (ultimo PriceSnapshot). */
  lastPriceChangeAt: Date | null;
  /** Direcao da ultima mudanca, quando ha ao menos dois pontos. */
  lastMovement: 'down' | 'up' | 'unknown';
  lastSyncedAt: Date | null;
  now: Date;
}

/** Uma alta recente nao e oportunidade: o componente e limitado. */
export const UPWARD_MOVEMENT_CAP = 3;
/** Dados velhos nao sustentam urgencia. */
export const STALE_SYNC_CAP = 2;

/**
 * Mede o quao recente e o movimento de preco, para que ofertas antigas nao
 * permanecam "excelentes" indefinidamente.
 *
 * Nao e cooldown: cooldown evita repetir a mesma oportunidade; freshness mede
 * se o movimento de preco ainda e novidade.
 */
export function scoreFreshness({
  lastPriceChangeAt,
  lastMovement,
  lastSyncedAt,
  now,
}: FreshnessInput): ComponentResult {
  if (!lastPriceChangeAt) {
    return result('freshness', 0, 'Sem mudanca de preco registrada');
  }

  const days = daysBetween(lastPriceChangeAt, now);
  let earned = recencyPoints(days);
  let reason = describeRecency(days, lastMovement);

  if (lastMovement === 'up' && earned > UPWARD_MOVEMENT_CAP) {
    earned = UPWARD_MOVEMENT_CAP;
    reason = 'Ultima variacao foi de alta';
  }

  if (lastSyncedAt && daysBetween(lastSyncedAt, now) > SYNC_STALE_DAYS && earned > STALE_SYNC_CAP) {
    earned = STALE_SYNC_CAP;
    reason = `Dados sincronizados ha mais de ${SYNC_STALE_DAYS} dias`;
  }

  return result('freshness', earned, reason);
}

function recencyPoints(days: number): number {
  if (days <= 1) return 10;
  if (days <= 3) return 8;
  if (days <= 7) return 6;
  if (days <= 14) return 4;
  if (days <= 30) return 2;
  return 0;
}

function describeRecency(days: number, movement: FreshnessInput['lastMovement']): string {
  const rounded = Math.max(0, Math.floor(days));
  const when = rounded === 0 ? 'hoje' : `ha ${rounded} dia(s)`;

  if (movement === 'down') return `Queda de preco ${when}`;

  return `Preco alterado ${when}`;
}
