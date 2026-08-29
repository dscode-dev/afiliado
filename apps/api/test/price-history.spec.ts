import { INestApplication } from '@nestjs/common';
import { authed, createTestHarness, resetDatabase, useFakeMarketplace } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MeliFakeServer } from './meli-fake-server';

const ITEM_ID = 'MLB1234567890';

describe('GET /products/:id/prices', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const meli = new MeliFakeServer();

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

  async function importAt(amount: number, regular?: number): Promise<string> {
    meli.seedItem({ id: ITEM_ID, title: 'Produto' }, { amount, regular });

    const response = await authed(app)
      .post('/products/import')
      .send({ marketplaceItemId: ITEM_ID })
      .expect(201);

    return response.body.product.id;
  }

  it('devolve o historico do mais recente para o mais antigo', async () => {
    const productId = await importAt(899, 999);
    await importAt(829, 999);
    await importAt(799, 999);

    const response = await authed(app)
      .get(`/products/${productId}/prices`)
      .expect(200);

    expect(response.body.map((entry: { price: string }) => entry.price)).toEqual([
      '799.00',
      '829.00',
      '899.00',
    ]);
    expect(response.body[0]).toMatchObject({
      price: '799.00',
      originalPrice: '999.00',
      currencyId: 'BRL',
    });
    expect(response.body[0].capturedAt).toEqual(expect.any(String));
  });

  it('respeita o limite informado', async () => {
    const productId = await importAt(100);
    await importAt(200);
    await importAt(300);

    const response = await authed(app)
      .get(`/products/${productId}/prices?limit=2`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body[0].price).toBe('300.00');
  });

  it('rejeita limite invalido', async () => {
    const productId = await importAt(100);

    await authed(app).get(`/products/${productId}/prices?limit=0`).expect(400);
    await authed(app).get(`/products/${productId}/prices?limit=99999`).expect(400);
    await authed(app).get(`/products/${productId}/prices?limit=abc`).expect(400);
  });

  it('devolve lista vazia para produto sem historico', async () => {
    const created = await authed(app)
      .post('/products')
      .send({
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: 'MLB-MANUAL-1',
        title: 'Cadastro manual',
        currentPrice: '10.00',
      })
      .expect(201);

    const response = await authed(app)
      .get(`/products/${created.body.id}/prices`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('retorna 404 para produto inexistente e 400 para id nao-UUID', async () => {
    await authed(app)
      .get('/products/0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c/prices')
      .expect(404);
    await authed(app).get('/products/nao-uuid/prices').expect(400);
  });

  it('remove o historico junto com o produto', async () => {
    const productId = await importAt(100);
    await importAt(200);

    await prisma.product.delete({ where: { id: productId } });

    expect(await prisma.priceSnapshot.count()).toBe(0);
  });
});
