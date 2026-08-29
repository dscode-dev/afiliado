import { INestApplication } from '@nestjs/common';
import { authed, createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { productPayload } from './fixtures';

describe('Validacao de entrada', () => {
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

  it('rejeita payload sem campos obrigatorios com formato de erro consistente', async () => {
    const response = await authed(app).post('/products').send({}).expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/products',
    });
    expect(Array.isArray(response.body.message)).toBe(true);
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('rejeita marketplace nao suportado', async () => {
    await authed(app)
      .post('/products')
      .send(productPayload({ marketplace: 'AMAZON' }))
      .expect(400);
  });

  it('rejeita preco com formato monetario invalido', async () => {
    await authed(app)
      .post('/products')
      .send(productPayload({ currentPrice: '10.999' }))
      .expect(400);

    await authed(app)
      .post('/products')
      .send(productPayload({ currentPrice: 'gratis' }))
      .expect(400);
  });

  it('bloqueia mass assignment de campos nao expostos pelo DTO', async () => {
    const response = await authed(app)
      .post('/products')
      .send({ ...productPayload(), id: 'valor-injetado', createdAt: '2020-01-01T00:00:00.000Z' })
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain('id');
    expect(await prisma.product.count()).toBe(0);
  });

  it('nao expira o whitelist em PATCH', async () => {
    const created = await authed(app)
      .post('/products')
      .send(productPayload())
      .expect(201);

    await authed(app)
      .patch(`/products/${created.body.id}`)
      .send({ marketplaceItemId: 'MLB-HACK' })
      .expect(400);

    const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(unchanged.marketplaceItemId).toBe(created.body.marketplaceItemId);
  });
});
