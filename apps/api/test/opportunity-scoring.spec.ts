import { OpportunityStatus, Prisma } from '@prisma/client';
import {
  SELLER_NEUTRAL,
  SPARSE_HISTORY_CAP,
  STALE_SYNC_CAP,
  UPWARD_MOVEMENT_CAP,
  scoreDiscount,
  scoreFreshness,
  scorePopularity,
  scorePriceHistory,
  scoreSeller,
} from '../src/modules/opportunity/scoring/components';
import { EvaluationInput, evaluate } from '../src/modules/opportunity/scoring/evaluator';
import { COMPONENT_MAX, MAX_SCORE } from '../src/modules/opportunity/scoring/weights';

const money = (value: string) => new Prisma.Decimal(value);
const NOW = new Date('2026-06-15T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

describe('pesos', () => {
  it('somam exatamente 100', () => {
    const total = Object.values(COMPONENT_MAX).reduce((sum, max) => sum + max, 0);

    expect(total).toBe(MAX_SCORE);
    expect(total).toBe(100);
  });
});

describe('scoreDiscount', () => {
  it('pontua por faixa de desconto', () => {
    const cases: [string, string, number][] = [
      ['700.00', '1000.00', 35], // 30%
      ['750.00', '1000.00', 25], // 25%
      ['850.00', '1000.00', 16], // 15%
      ['950.00', '1000.00', 8], //  5%
      ['999.50', '1000.00', 0], //  0.05%
    ];

    for (const [current, original, expected] of cases) {
      expect(scoreDiscount({ currentPrice: money(current), originalPrice: money(original) }).earned)
        .toBe(expected);
    }
  });

  it('vale zero sem preco original confiavel', () => {
    expect(scoreDiscount({ currentPrice: money('100'), originalPrice: null }).earned).toBe(0);
    expect(
      scoreDiscount({ currentPrice: money('100'), originalPrice: money('100') }).earned,
    ).toBe(0);
    // Preco "de" menor que o atual nao vira desconto negativo.
    expect(scoreDiscount({ currentPrice: money('100'), originalPrice: money('80') }).earned).toBe(0);
  });

  it('explica o desconto encontrado', () => {
    expect(
      scoreDiscount({ currentPrice: money('720'), originalPrice: money('1000') }).reason,
    ).toBe('Desconto oficial de 28%');
  });
});

describe('scorePriceHistory', () => {
  const stats = (min: string, max: string, average: string, samples = 5) => ({
    samples,
    min: money(min),
    max: money(max),
    average: money(average),
  });

  const run = (current: string, s: ReturnType<typeof stats>) =>
    scorePriceHistory({ currentPrice: money(current), stats: s, windowDays: 30 });

  it('pontua ao maximo no menor preco acompanhado', () => {
    expect(run('700', stats('700', '1000', '850')).earned).toBe(25);
    // Abaixo do minimo conhecido tambem e o melhor caso.
    expect(run('650', stats('700', '1000', '850')).earned).toBe(25);
  });

  it('degrada conforme se afasta do minimo e da media', () => {
    expect(run('710', stats('700', '1000', '900')).earned).toBe(22); // ~min
    expect(run('800', stats('700', '1000', '900')).earned).toBe(18); // <= 90% da media
    expect(run('880', stats('700', '1000', '900')).earned).toBe(13); // abaixo da media
    expect(run('930', stats('700', '1000', '900')).earned).toBe(7); //  proximo da media
    expect(run('990', stats('700', '1000', '900')).earned).toBe(2); //  acima da media
  });

  it('vale zero sem historico na janela', () => {
    const result = scorePriceHistory({
      currentPrice: money('700'),
      stats: { samples: 0, min: null, max: null, average: null },
      windowDays: 30,
    });

    expect(result.earned).toBe(0);
    expect(result.reason).toContain('Sem historico');
  });

  it('limita o score quando existe um unico ponto', () => {
    const result = run('700', stats('700', '700', '700', 1));

    expect(result.earned).toBe(SPARSE_HISTORY_CAP);
    expect(result.reason).toContain('insuficiente');
  });
});

describe('scorePopularity', () => {
  it('pontua por posicao no ranking', () => {
    const at = (position: number) =>
      scorePopularity({ highlightPosition: position, highlightCheckedAt: NOW, now: NOW }).earned;

    expect(at(1)).toBe(20);
    expect(at(3)).toBe(20);
    expect(at(4)).toBe(15);
    expect(at(10)).toBe(15);
    expect(at(11)).toBe(10);
    expect(at(20)).toBe(10);
  });

  it('vale zero quando o produto esta fora do ranking', () => {
    const result = scorePopularity({
      highlightPosition: null,
      highlightCheckedAt: NOW,
      now: NOW,
    });

    expect(result.earned).toBe(0);
    expect(result.reason).toContain('Fora dos mais vendidos');
  });

  it('vale zero, sem penalizacao extra, quando nunca foi verificado', () => {
    const result = scorePopularity({
      highlightPosition: null,
      highlightCheckedAt: null,
      now: NOW,
    });

    expect(result.earned).toBe(0);
    expect(result.reason).toContain('nao verificada');
  });

  it('descarta popularidade antiga', () => {
    expect(
      scorePopularity({ highlightPosition: 1, highlightCheckedAt: daysAgo(8), now: NOW }).earned,
    ).toBe(0);
  });
});

describe('scoreSeller', () => {
  it('prefere o status de power seller', () => {
    expect(scoreSeller({ reputationLevel: '1_red', sellerStatus: 'platinum' }).earned).toBe(10);
    expect(scoreSeller({ reputationLevel: null, sellerStatus: 'gold' }).earned).toBe(9);
    expect(scoreSeller({ reputationLevel: null, sellerStatus: 'silver' }).earned).toBe(8);
  });

  it('cai para a reputacao quando nao ha power seller', () => {
    expect(scoreSeller({ reputationLevel: '5_green', sellerStatus: null }).earned).toBe(8);
    expect(scoreSeller({ reputationLevel: '3_yellow', sellerStatus: null }).earned).toBe(4);
    expect(scoreSeller({ reputationLevel: '1_red', sellerStatus: null }).earned).toBe(0);
  });

  it('e neutro quando nao ha dado de vendedor', () => {
    const result = scoreSeller({ reputationLevel: null, sellerStatus: null });

    expect(result.earned).toBe(SELLER_NEUTRAL);
    expect(result.reason).toContain('neutro');
  });
});

describe('scoreFreshness', () => {
  const run = (days: number, movement: 'down' | 'up' | 'unknown' = 'down', syncedDays = 0) =>
    scoreFreshness({
      lastPriceChangeAt: daysAgo(days),
      lastMovement: movement,
      lastSyncedAt: daysAgo(syncedDays),
      now: NOW,
    });

  it('pontua mais quanto mais recente for a mudanca de preco', () => {
    expect(run(0).earned).toBe(10);
    expect(run(2).earned).toBe(8);
    expect(run(5).earned).toBe(6);
    expect(run(10).earned).toBe(4);
    expect(run(20).earned).toBe(2);
    expect(run(40).earned).toBe(0);
  });

  it('limita o score quando a ultima variacao foi de alta', () => {
    expect(run(0, 'up').earned).toBe(UPWARD_MOVEMENT_CAP);
    // Uma alta antiga ja valia menos que o teto: permanece como estava.
    expect(run(20, 'up').earned).toBe(2);
  });

  it('limita o score quando os dados estao velhos', () => {
    expect(run(0, 'down', 10).earned).toBe(STALE_SYNC_CAP);
  });

  it('vale zero sem mudanca de preco registrada', () => {
    const result = scoreFreshness({
      lastPriceChangeAt: null,
      lastMovement: 'unknown',
      lastSyncedAt: NOW,
      now: NOW,
    });

    expect(result.earned).toBe(0);
  });
});

describe('evaluate', () => {
  const base: EvaluationInput = {
    currentPrice: money('700.00'),
    originalPrice: money('1000.00'),
    history: { samples: 5, min: money('700'), max: money('1000'), average: money('850') },
    historyWindowDays: 30,
    lastPriceChangeAt: NOW,
    lastMovement: 'down',
    lastSyncedAt: NOW,
    highlightPosition: 1,
    highlightCheckedAt: NOW,
    sellerReputationLevel: '5_green',
    sellerStatus: 'platinum',
    hasActiveAffiliateLink: true,
    now: NOW,
  };

  it('alcanca o score maximo no melhor cenario possivel', () => {
    const result = evaluate(base);

    expect(result.score).toBe(100);
    expect(result.status).toBe(OpportunityStatus.APPROVED);
    expect(result.breakdown).toEqual({
      discount: { earned: 35, max: 35 },
      priceHistory: { earned: 25, max: 25 },
      popularity: { earned: 20, max: 20 },
      seller: { earned: 10, max: 10 },
      freshness: { earned: 10, max: 10 },
    });
  });

  it('alcanca o score minimo no pior cenario possivel', () => {
    const result = evaluate({
      ...base,
      originalPrice: null,
      history: { samples: 0, min: null, max: null, average: null },
      lastPriceChangeAt: null,
      lastMovement: 'unknown',
      highlightPosition: null,
      highlightCheckedAt: null,
      sellerReputationLevel: '1_red',
      sellerStatus: null,
    });

    expect(result.score).toBe(0);
    expect(result.status).toBe(OpportunityStatus.IGNORE);
  });

  it('e deterministico: a mesma entrada produz sempre a mesma saida', () => {
    const first = evaluate(base);
    const second = evaluate(base);

    expect(second.score).toBe(first.score);
    expect(second.breakdown).toEqual(first.breakdown);
    expect(second.reasons).toEqual(first.reasons);
  });

  it('o score e a soma exata dos componentes', () => {
    const result = evaluate({ ...base, highlightPosition: 7, sellerStatus: null });
    const sum = Object.values(result.breakdown).reduce((total, part) => total + part.earned, 0);

    expect(result.score).toBe(sum);
  });

  it('marca NOT_ELIGIBLE sem link afiliado ativo, mesmo com score maximo', () => {
    const result = evaluate({ ...base, hasActiveAffiliateLink: false });

    expect(result.score).toBe(100);
    expect(result.status).toBe(OpportunityStatus.NOT_ELIGIBLE);
    expect(result.reasons[0]).toContain('sem link de afiliado ativo');
  });

  it('aplica os limiares de decisao', () => {
    // 35 + 13 + 15 + 8 + 8 = 79 -> CANDIDATE
    const candidate = evaluate({
      ...base,
      history: { samples: 5, min: money('600'), max: money('1000'), average: money('750') },
      currentPrice: money('700.00'),
      highlightPosition: 5,
      sellerStatus: null,
      lastPriceChangeAt: daysAgo(2),
    });

    expect(candidate.score).toBe(79);
    expect(candidate.status).toBe(OpportunityStatus.CANDIDATE);

    // Abaixo de 70 vira IGNORE.
    const ignored = evaluate({
      ...base,
      originalPrice: null,
      highlightPosition: null,
      sellerStatus: null,
      lastPriceChangeAt: daysAgo(20),
    });

    expect(ignored.score).toBeLessThan(70);
    expect(ignored.status).toBe(OpportunityStatus.IGNORE);
  });

  it('produz um breakdown explicavel com uma razao por componente', () => {
    const result = evaluate(base);

    expect(result.reasons).toHaveLength(5);
    expect(result.reasons).toContain('Desconto oficial de 30%');
    expect(result.reasons).toContain('Menor preco dos ultimos 30 dias');
    expect(result.reasons).toContain('Top 1 dos mais vendidos da categoria');
  });
});
