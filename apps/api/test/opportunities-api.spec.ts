import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createTestHarness, resetDatabase, useFakeMarketplace } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MeliFakeServer } from './meli-fake-server';

const money = (value: string) => new Prisma.Decimal(value);

describe('GET /opportunities', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const meli = new MeliFakeServer();
  let sequence = 0;

  beforeAll(async () => {
    await meli.start();
    useFakeMarketplace(meli.baseUrl);
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    meli.reset();
  });

  afterAll(async () => {
    await app?.close();
    await meli.stop();
  });

  async function seed(options: {
    category?: string;
    highlightPosition?: number | null;
    withLink?: boolean;
    price?: string;
  }): Promise<string> {
    sequence += 1;

    const product = await prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: `MLB${800000 + sequence}`,
        title: `Produto ${sequence}`,
        category: options.category ?? 'Eletronicos',
        categoryId: 'MLB1051',
        currentPrice: money(options.price ?? '700.00'),
        originalPrice: money('1000.00'),
        highlightPosition:
          options.highlightPosition === undefined ? 1 : options.highlightPosition,
        highlightCheckedAt: new Date(),
        sellerStatus: 'platinum',
        lastSyncedAt: new Date(),
      },
    });

    await prisma.priceSnapshot.createMany({
      data: [
        { productId: product.id, price: money('1000.00'), capturedAt: new Date(Date.now() - 86_400_000) },
        { productId: product.id, price: money(options.price ?? '700.00') },
      ],
    });

    if (options.withLink !== false) {
      await prisma.affiliateLink.create({
        data: { productId: product.id, url: `https://mercadolivre.com/sec/${product.id}` },
      });
    }

    await request(app.getHttpServer()).post(`/products/${product.id}/evaluate`).expect(200);

    return product.id;
  }

  it('devolve o estado operacional de cada oportunidade', async () => {
    const productId = await seed({});

    const response = await request(app.getHttpServer()).get('/opportunities').expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0]).toMatchObject({
      productId,
      status: 'APPROVED',
      effectiveStatus: 'APPROVED',
      hasActiveAffiliateLink: true,
      offerStatus: 'APPROVED',
      price: '700.00',
    });
    expect(response.body.data[0].breakdown.discount.max).toBe(35);
    expect(response.body.data[0].reasons.length).toBeGreaterThan(0);
    expect(response.body.data[0].evaluatedAt).toEqual(expect.any(String));
  });

  it('sinaliza produtos que precisam de link afiliado', async () => {
    await seed({ withLink: false });

    const response = await request(app.getHttpServer())
      .get('/opportunities?status=NOT_ELIGIBLE')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0]).toMatchObject({
      status: 'NOT_ELIGIBLE',
      hasActiveAffiliateLink: false,
      affiliateLinkUrl: null,
      offerId: null,
    });
    // O score continua visivel: e o que justifica cadastrar o link.
    expect(response.body.data[0].score).toBeGreaterThanOrEqual(85);
  });

  it('filtra por status, categoria e score minimo', async () => {
    await seed({ category: 'Eletronicos' });
    await seed({ category: 'Casa', highlightPosition: null });

    const approved = await request(app.getHttpServer())
      .get('/opportunities?status=APPROVED')
      .expect(200);
    expect(approved.body.total).toBe(1);

    const byCategory = await request(app.getHttpServer())
      .get('/opportunities?category=casa')
      .expect(200);
    expect(byCategory.body.total).toBe(1);
    expect(byCategory.body.data[0].category).toBe('Casa');

    const byScore = await request(app.getHttpServer())
      .get('/opportunities?minScore=85')
      .expect(200);
    expect(byScore.body.total).toBe(1);
    expect(byScore.body.data[0].score).toBeGreaterThanOrEqual(85);
  });

  it('ordena do maior para o menor score', async () => {
    await seed({ highlightPosition: null });
    await seed({});

    const response = await request(app.getHttpServer()).get('/opportunities').expect(200);

    const scores = response.body.data.map((row: { score: number }) => row.score);
    expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
  });

  it('valida os filtros', async () => {
    await request(app.getHttpServer()).get('/opportunities?status=TALVEZ').expect(400);
    await request(app.getHttpServer()).get('/opportunities?minScore=101').expect(400);
    await request(app.getHttpServer()).get('/opportunities?minScore=abc').expect(400);
  });

  it('mostra a decisao humana ao lado da recomendacao do engine', async () => {
    const productId = await seed({});

    await request(app.getHttpServer())
      .post(`/opportunities/${productId}/decision`)
      .send({ decision: 'REJECTED', note: 'Margem baixa' })
      .expect(200);

    const response = await request(app.getHttpServer()).get('/opportunities').expect(200);

    expect(response.body.data[0]).toMatchObject({
      status: 'APPROVED',
      operatorDecision: 'REJECTED',
      operatorNote: 'Margem baixa',
      effectiveStatus: 'REJECTED',
    });
  });

  it('devolve lista vazia quando nada foi avaliado', async () => {
    const response = await request(app.getHttpServer()).get('/opportunities').expect(200);

    expect(response.body).toMatchObject({ total: 0, data: [] });
  });
});
