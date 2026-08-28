import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { productPayload } from './fixtures';

describe('Affiliate links', () => {
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
    const response = await request(app.getHttpServer())
      .post('/products')
      .send(productPayload())
      .expect(201);

    return response.body.id;
  }

  it('associa um link a um produto existente', async () => {
    const productId = await createProduct();

    const response = await request(app.getHttpServer())
      .post('/affiliate-links')
      .send({ productId, url: 'https://mercadolivre.com/sec/abc123', label: 'telegram-principal' })
      .expect(201);

    expect(response.body).toMatchObject({
      productId,
      url: 'https://mercadolivre.com/sec/abc123',
      label: 'telegram-principal',
      active: true,
    });
    expect(response.body.product).toMatchObject({ id: productId });
  });

  it('recusa link para produto inexistente', async () => {
    const response = await request(app.getHttpServer())
      .post('/affiliate-links')
      .send({
        productId: '0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c',
        url: 'https://mercadolivre.com/sec/abc123',
      })
      .expect(422);

    expect(response.body.statusCode).toBe(422);
    expect(await prisma.affiliateLink.count()).toBe(0);
  });

  it('recusa url invalida', async () => {
    const productId = await createProduct();

    await request(app.getHttpServer())
      .post('/affiliate-links')
      .send({ productId, url: 'nao-e-url' })
      .expect(400);
  });

  it('desativa um link sem remove-lo', async () => {
    const productId = await createProduct();
    const created = await request(app.getHttpServer())
      .post('/affiliate-links')
      .send({ productId, url: 'https://mercadolivre.com/sec/abc123' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/affiliate-links/${created.body.id}`)
      .send({ active: false, label: 'aposentado' })
      .expect(200);

    expect(updated.body).toMatchObject({ active: false, label: 'aposentado', productId });
    expect(await prisma.affiliateLink.count()).toBe(1);
  });

  it('remove os links em cascata quando o produto e excluido', async () => {
    const productId = await createProduct();
    await request(app.getHttpServer())
      .post('/affiliate-links')
      .send({ productId, url: 'https://mercadolivre.com/sec/abc123' })
      .expect(201);

    await prisma.product.delete({ where: { id: productId } });

    expect(await prisma.affiliateLink.count()).toBe(0);
  });

  it('filtra por productId', async () => {
    const first = await createProduct();
    const second = await createProduct();

    await request(app.getHttpServer())
      .post('/affiliate-links')
      .send({ productId: first, url: 'https://mercadolivre.com/sec/um' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/affiliate-links')
      .send({ productId: second, url: 'https://mercadolivre.com/sec/dois' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/affiliate-links?productId=${first}`)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].productId).toBe(first);
  });
});
