import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { productPayload } from './fixtures';

describe('Products', () => {
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

  it('cria um produto e devolve precos como string de 2 casas', async () => {
    const payload = productPayload({ currentPrice: '199.9' });

    const response = await request(app.getHttpServer())
      .post('/products')
      .send(payload)
      .expect(201);

    expect(response.body).toMatchObject({
      marketplace: 'MERCADO_LIVRE',
      marketplaceItemId: payload.marketplaceItemId,
      title: payload.title,
      currentPrice: '199.90',
      originalPrice: '299.90',
      active: true,
    });
    expect(response.body.id).toEqual(expect.any(String));
  });

  it('rejeita marketplaceItemId duplicado dentro do mesmo marketplace', async () => {
    const payload = productPayload();

    await request(app.getHttpServer()).post('/products').send(payload).expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/products')
      .send({ ...payload, title: 'Outro titulo' })
      .expect(409);

    expect(conflict.body).toMatchObject({ statusCode: 409, error: 'Conflict' });
    expect(await prisma.product.count()).toBe(1);
  });

  it('edita um produto e preserva a identidade no marketplace', async () => {
    const created = await request(app.getHttpServer())
      .post('/products')
      .send(productPayload())
      .expect(201);

    const updated = await request(app.getHttpServer())
      .patch(`/products/${created.body.id}`)
      .send({ title: 'Titulo revisado', currentPrice: '149.00', active: false })
      .expect(200);

    expect(updated.body).toMatchObject({
      id: created.body.id,
      title: 'Titulo revisado',
      currentPrice: '149.00',
      active: false,
      marketplaceItemId: created.body.marketplaceItemId,
    });
  });

  it('lista com filtro de active e devolve total paginado', async () => {
    const first = await request(app.getHttpServer())
      .post('/products')
      .send(productPayload())
      .expect(201);
    await request(app.getHttpServer()).post('/products').send(productPayload()).expect(201);

    await request(app.getHttpServer())
      .patch(`/products/${first.body.id}`)
      .send({ active: false })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/products?active=true')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].active).toBe(true);
  });

  it('retorna 404 para produto inexistente e 400 para id nao-UUID', async () => {
    await request(app.getHttpServer())
      .get('/products/0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c')
      .expect(404);

    await request(app.getHttpServer()).get('/products/nao-e-uuid').expect(400);
  });
});
