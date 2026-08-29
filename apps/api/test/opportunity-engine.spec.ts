import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';

const money = (value: string) => new Prisma.Decimal(value);
const DAY_MS = 86_400_000;

interface ProductOptions {
  currentPrice?: string;
  originalPrice?: string | null;
  highlightPosition?: number | null;
  highlightCheckedAt?: Date | null;
  sellerStatus?: string | null;
  lastSyncedAt?: Date | null;
}

describe('Opportunity Engine', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sequence = 0;

  beforeAll(async () => {
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Produto no melhor cenario possivel, salvo o que o teste sobrescrever. */
  async function createProduct(options: ProductOptions = {}): Promise<string> {
    sequence += 1;
    const now = new Date();

    const product = await prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: `MLB${900000 + sequence}`,
        title: `Produto ${sequence}`,
        category: 'Eletronicos',
        categoryId: 'MLB1051',
        currentPrice: money(options.currentPrice ?? '700.00'),
        originalPrice:
          options.originalPrice === null ? null : money(options.originalPrice ?? '1000.00'),
        highlightPosition:
          options.highlightPosition === undefined ? 1 : options.highlightPosition,
        highlightCheckedAt:
          options.highlightCheckedAt === undefined ? now : options.highlightCheckedAt,
        sellerStatus: options.sellerStatus === undefined ? 'platinum' : options.sellerStatus,
        lastSyncedAt: options.lastSyncedAt === undefined ? now : options.lastSyncedAt,
      },
    });

    return product.id;
  }

  async function addSnapshots(productId: string, prices: string[]): Promise<void> {
    // Do mais antigo para o mais recente, um por dia.
    for (const [index, price] of prices.entries()) {
      await prisma.priceSnapshot.create({
        data: {
          productId,
          price: money(price),
          capturedAt: new Date(Date.now() - (prices.length - 1 - index) * DAY_MS),
        },
      });
    }
  }

  async function addLink(productId: string, active = true): Promise<string> {
    const link = await prisma.affiliateLink.create({
      data: { productId, url: `https://mercadolivre.com/sec/${productId}`, active },
    });

    return link.id;
  }

  const evaluateProduct = (productId: string) =>
    request(app.getHttpServer()).post(`/products/${productId}/evaluate`);

  describe('elegibilidade', () => {
    it('marca NOT_ELIGIBLE sem link afiliado, mesmo com score alto', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);

      const response = await evaluateProduct(productId).expect(200);

      expect(response.body.score).toBeGreaterThanOrEqual(85);
      expect(response.body.status).toBe('NOT_ELIGIBLE');
      expect(response.body.offerId).toBeNull();
      expect(await prisma.offer.count()).toBe(0);
    });

    it('marca NOT_ELIGIBLE quando o link existe mas esta inativo', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId, false);

      const response = await evaluateProduct(productId).expect(200);

      expect(response.body.status).toBe('NOT_ELIGIBLE');
      expect(await prisma.offer.count()).toBe(0);
    });

    it('torna-se elegivel apos cadastrar o link e reavaliar', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);

      const before = await evaluateProduct(productId).expect(200);
      expect(before.body.status).toBe('NOT_ELIGIBLE');

      await request(app.getHttpServer())
        .post('/affiliate-links')
        .send({ productId, url: 'https://mercadolivre.com/sec/abc', sourceLabel: 'painel' })
        .expect(201);

      const after = await evaluateProduct(productId).expect(200);

      expect(after.body.score).toBe(before.body.score);
      expect(after.body.status).toBe('APPROVED');
      expect(after.body.offerCreated).toBe(true);
    });
  });

  describe('persistencia e explicabilidade', () => {
    it('guarda score, breakdown e razoes legiveis', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      const response = await evaluateProduct(productId).expect(200);

      const stored = await prisma.opportunityEvaluation.findUniqueOrThrow({
        where: { productId },
      });

      expect(stored.score).toBe(response.body.score);
      expect(stored.status).toBe(response.body.status);
      expect(stored.reasons.length).toBe(5);
      expect(stored.breakdown).toEqual(response.body.breakdown);

      const total = Object.values(
        response.body.breakdown as Record<string, { earned: number }>,
      ).reduce((sum, part) => sum + part.earned, 0);
      expect(total).toBe(response.body.score);
    });

    it('mantem uma unica linha de avaliacao por produto', async () => {
      const productId = await createProduct();
      await addLink(productId);

      await evaluateProduct(productId).expect(200);
      await evaluateProduct(productId).expect(200);
      await evaluateProduct(productId).expect(200);

      expect(await prisma.opportunityEvaluation.count({ where: { productId } })).toBe(1);
    });

    it('retorna 404 para produto inexistente', async () => {
      await request(app.getHttpServer())
        .post('/products/0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c/evaluate')
        .expect(404);
    });
  });

  describe('geracao de Offer', () => {
    it('cria Offer APPROVED quando o engine aprova', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      const response = await evaluateProduct(productId).expect(200);

      expect(response.body.status).toBe('APPROVED');
      const offer = await prisma.offer.findFirstOrThrow({ where: { productId } });
      expect(offer.status).toBe('APPROVED');
      expect(offer.price.toFixed(2)).toBe('700.00');
      expect(offer.discountPercentage?.toFixed(2)).toBe('30.00');
    });

    it('nao cria Offer quando o engine manda ignorar', async () => {
      const productId = await createProduct({
        originalPrice: null,
        highlightPosition: null,
        sellerStatus: null,
      });
      await addLink(productId);

      const response = await evaluateProduct(productId).expect(200);

      expect(response.body.status).toBe('IGNORE');
      expect(response.body.offerId).toBeNull();
      expect(await prisma.offer.count()).toBe(0);
    });

    it('e idempotente: reavaliar sem mudanca nao duplica Offer', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      const first = await evaluateProduct(productId).expect(200);
      const second = await evaluateProduct(productId).expect(200);
      const third = await evaluateProduct(productId).expect(200);

      expect(first.body.offerCreated).toBe(true);
      expect(second.body.offerCreated).toBe(false);
      expect(third.body.offerCreated).toBe(false);
      expect(second.body.offerId).toBe(first.body.offerId);
      expect(await prisma.offer.count()).toBe(1);
    });

    it('cria nova oportunidade quando o preco muda', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      await evaluateProduct(productId).expect(200);

      await prisma.product.update({
        where: { id: productId },
        data: { currentPrice: money('650.00') },
      });
      await addSnapshots(productId, ['650.00']);

      const second = await evaluateProduct(productId).expect(200);

      expect(second.body.offerCreated).toBe(true);
      expect(await prisma.offer.count()).toBe(2);

      const prices = (await prisma.offer.findMany({ where: { productId } }))
        .map((offer) => offer.price.toFixed(2))
        .sort();
      expect(prices).toEqual(['650.00', '700.00']);
    });
  });

  describe('cooldown', () => {
    it('suprime a mesma oportunidade ja aprovada dentro da janela', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      const first = await evaluateProduct(productId).expect(200);
      expect(first.body.suppressedByCooldown).toBe(false);

      const second = await evaluateProduct(productId).expect(200);

      expect(second.body.suppressedByCooldown).toBe(true);
      expect(second.body.offerCreated).toBe(false);
      expect(second.body.status).toBe('APPROVED');
    });

    it('volta a processar depois que o cooldown expira', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      await evaluateProduct(productId).expect(200);

      // Envelhece a Offer para alem da janela de 24h.
      await prisma.offer.updateMany({
        where: { productId },
        data: { updatedAt: new Date(Date.now() - 48 * 3_600_000) },
      });

      const response = await evaluateProduct(productId).expect(200);

      expect(response.body.suppressedByCooldown).toBe(false);
      expect(await prisma.offer.count()).toBe(1);
    });
  });

  describe('override manual', () => {
    it('respeita aprovacao humana sobre recomendacao CANDIDATE', async () => {
      // Sem popularidade o score cai para a faixa de CANDIDATE.
      const productId = await createProduct({ highlightPosition: null });
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      const engine = await evaluateProduct(productId).expect(200);
      expect(engine.body.status).toBe('CANDIDATE');

      const decided = await request(app.getHttpServer())
        .post(`/opportunities/${productId}/decision`)
        .send({ decision: 'APPROVED', note: 'Campanha de fim de semana' })
        .expect(200);

      // O score do engine nao e sobrescrito - os dois convivem.
      expect(decided.body.status).toBe('CANDIDATE');
      expect(decided.body.operatorDecision).toBe('APPROVED');
      expect(decided.body.effectiveStatus).toBe('APPROVED');

      const offer = await prisma.offer.findFirstOrThrow({ where: { productId } });
      expect(offer.status).toBe('APPROVED');
    });

    it('respeita rejeicao humana sobre recomendacao APPROVED', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      await evaluateProduct(productId).expect(200);

      const decided = await request(app.getHttpServer())
        .post(`/opportunities/${productId}/decision`)
        .send({ decision: 'REJECTED' })
        .expect(200);

      expect(decided.body.status).toBe('APPROVED');
      expect(decided.body.effectiveStatus).toBe('REJECTED');

      const offer = await prisma.offer.findFirstOrThrow({ where: { productId } });
      expect(offer.status).toBe('REJECTED');
    });

    it('preserva a decisao humana entre reavaliacoes', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      await evaluateProduct(productId).expect(200);
      await request(app.getHttpServer())
        .post(`/opportunities/${productId}/decision`)
        .send({ decision: 'REJECTED' })
        .expect(200);

      const reevaluated = await evaluateProduct(productId).expect(200);

      expect(reevaluated.body.operatorDecision).toBe('REJECTED');
      expect(reevaluated.body.effectiveStatus).toBe('REJECTED');

      const offer = await prisma.offer.findFirstOrThrow({ where: { productId } });
      expect(offer.status).toBe('REJECTED');
    });

    it('permite devolver a decisao ao engine', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);
      await addLink(productId);

      await evaluateProduct(productId).expect(200);
      await request(app.getHttpServer())
        .post(`/opportunities/${productId}/decision`)
        .send({ decision: 'REJECTED' })
        .expect(200);

      const cleared = await request(app.getHttpServer())
        .delete(`/opportunities/${productId}/decision`)
        .expect(200);

      expect(cleared.body.operatorDecision).toBeNull();
      expect(cleared.body.effectiveStatus).toBe('APPROVED');
    });

    it('nao deixa o operador contornar a falta de link afiliado', async () => {
      const productId = await createProduct();
      await addSnapshots(productId, ['1000.00', '700.00']);

      await evaluateProduct(productId).expect(200);

      const decided = await request(app.getHttpServer())
        .post(`/opportunities/${productId}/decision`)
        .send({ decision: 'APPROVED' })
        .expect(200);

      expect(decided.body.effectiveStatus).toBe('NOT_ELIGIBLE');
      expect(await prisma.offer.count()).toBe(0);
    });

    it('exige avaliacao previa e valida a decisao', async () => {
      const productId = await createProduct();

      await request(app.getHttpServer())
        .post(`/opportunities/${productId}/decision`)
        .send({ decision: 'APPROVED' })
        .expect(404);

      await evaluateProduct(productId).expect(200);

      await request(app.getHttpServer())
        .post(`/opportunities/${productId}/decision`)
        .send({ decision: 'TALVEZ' })
        .expect(400);
    });
  });

  describe('avaliacao em lote', () => {
    it('classifica os produtos ativos e relata os totais', async () => {
      const approved = await createProduct();
      await addSnapshots(approved, ['1000.00', '700.00']);
      await addLink(approved);

      const candidate = await createProduct({ highlightPosition: null });
      await addSnapshots(candidate, ['1000.00', '700.00']);
      await addLink(candidate);

      const ignored = await createProduct({
        originalPrice: null,
        highlightPosition: null,
        sellerStatus: null,
      });
      await addLink(ignored);

      await createProduct(); // sem link -> NOT_ELIGIBLE

      const response = await request(app.getHttpServer())
        .post('/products/evaluate')
        .expect(200);

      expect(response.body).toMatchObject({
        total: 4,
        approved: 1,
        candidate: 1,
        ignored: 1,
        notEligible: 1,
        failed: 0,
      });
      expect(response.body.offersCreated).toBe(2);
    });

    it('ignora produtos inativos', async () => {
      const productId = await createProduct();
      await addLink(productId);
      await prisma.product.update({ where: { id: productId }, data: { active: false } });

      const response = await request(app.getHttpServer())
        .post('/products/evaluate')
        .expect(200);

      expect(response.body.total).toBe(0);
    });

    it('uma falha nao interrompe o lote', async () => {
      const healthy = await createProduct();
      await addSnapshots(healthy, ['1000.00', '700.00']);
      await addLink(healthy);

      const broken = await createProduct();
      await addLink(broken);

      // Forca a leitura de historico a falhar apenas para um dos produtos.
      const original = prisma.priceSnapshot.findMany.bind(prisma.priceSnapshot);
      const spy = jest.spyOn(prisma.priceSnapshot, 'findMany').mockImplementation(((
        args: { where?: { productId?: unknown } } | undefined,
      ) =>
        args?.where?.productId === broken
          ? Promise.reject(new Error('falha simulada de leitura'))
          : original(args as never)) as never);

      try {
        const response = await request(app.getHttpServer())
          .post('/products/evaluate')
          .expect(200);

        expect(response.body.total).toBe(2);
        expect(response.body.failed).toBe(1);
        expect(response.body.failures).toEqual([
          expect.objectContaining({ productId: broken }),
        ]);

        // O produto saudavel foi avaliado normalmente apesar da falha do outro.
        expect(response.body.approved).toBe(1);
        expect(await prisma.offer.count({ where: { productId: healthy } })).toBe(1);
      } finally {
        spy.mockRestore();
      }

      // O produto que falhou nao deixou avaliacao pela metade.
      expect(await prisma.opportunityEvaluation.count({ where: { productId: broken } })).toBe(0);
    });
  });
});
