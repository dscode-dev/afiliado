import { INestApplication } from '@nestjs/common';
import { authed, createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { productPayload } from './fixtures';

describe('Offers', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createProduct(): Promise<string> {
    const response = await authed(app)
      .post('/products')
      .send(productPayload())
      .expect(201);

    return response.body.id;
  }

  it('nasce com status DETECTED quando nenhum status e informado', async () => {
    const productId = await createProduct();

    const response = await authed(app)
      .post('/offers')
      .send({ productId, price: '149.90', originalPrice: '299.90', discountPercentage: '50' })
      .expect(201);

    expect(response.body).toMatchObject({
      productId,
      price: '149.90',
      originalPrice: '299.90',
      status: 'DETECTED',
    });
    expect(response.body.detectedAt).toEqual(expect.any(String));
    expect(response.body.product).toMatchObject({ id: productId });
  });

  it('percorre a transicao de status ate APPROVED', async () => {
    const productId = await createProduct();
    const created = await authed(app)
      .post('/offers')
      .send({ productId, price: '149.90' })
      .expect(201);

    for (const status of ['CANDIDATE', 'APPROVED'] as const) {
      const updated = await authed(app)
        .patch(`/offers/${created.body.id}`)
        .send({ status })
        .expect(200);

      expect(updated.body.status).toBe(status);
    }
  });

  it('recusa status fora do conjunto definido', async () => {
    const productId = await createProduct();
    const created = await authed(app)
      .post('/offers')
      .send({ productId, price: '149.90' })
      .expect(201);

    await authed(app)
      .patch(`/offers/${created.body.id}`)
      .send({ status: 'PUBLICADA' })
      .expect(400);

    const unchanged = await prisma.offer.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(unchanged.status).toBe('DETECTED');
  });

  it('recusa oferta para produto inexistente', async () => {
    await authed(app)
      .post('/offers')
      .send({ productId: '0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c', price: '10.00' })
      .expect(422);
  });

  it('recusa desconto fora do intervalo 0-100', async () => {
    const productId = await createProduct();

    await authed(app)
      .post('/offers')
      .send({ productId, price: '10.00', discountPercentage: '150' })
      .expect(400);
  });

  it('filtra ofertas por status', async () => {
    const productId = await createProduct();

    await authed(app)
      .post('/offers')
      .send({ productId, price: '10.00' })
      .expect(201);
    await authed(app)
      .post('/offers')
      .send({ productId, price: '20.00', status: 'APPROVED' })
      .expect(201);

    const response = await authed(app)
      .get('/offers?status=APPROVED')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].price).toBe('20.00');
  });
});
