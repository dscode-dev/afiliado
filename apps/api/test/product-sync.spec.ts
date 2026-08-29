import { INestApplication } from '@nestjs/common';
import { authed, createTestHarness, resetDatabase, useFakeMarketplace } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MeliFakeServer } from './meli-fake-server';

describe('Sincronizacao de produtos', () => {
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
    meli.categories.set('MLB1051', { id: 'MLB1051', name: 'Celulares e Telefones' });
  });

  afterAll(async () => {
    await app?.close();
    await meli.stop();
  });

  async function importItem(id: string, amount: number): Promise<string> {
    meli.seedItem(
      { id, title: `Produto ${id}`, category_id: 'MLB1051', currency_id: 'BRL', status: 'active' },
      { amount },
    );

    const response = await authed(app)
      .post('/products/import')
      .send({ marketplaceItemId: id })
      .expect(201);

    return response.body.product.id;
  }

  describe('sync individual', () => {
    it('atualiza preco e registra novo ponto no historico', async () => {
      const productId = await importItem('MLB1000000001', 799.9);

      meli.seedItem(
        { id: 'MLB1000000001', title: 'Produto MLB1000000001', category_id: 'MLB1051' },
        { amount: 699.0, regular: 899.0 },
      );

      const response = await authed(app)
        .post(`/products/${productId}/sync`)
        .expect(200);

      expect(response.body.outcome).toBe('updated');
      expect(response.body.priceSnapshotCreated).toBe(true);
      expect(response.body.product.currentPrice).toBe('699.00');
      expect(response.body.product.originalPrice).toBe('899.00');
      expect(await prisma.priceSnapshot.count()).toBe(2);
    });

    it('reporta unchanged e nao gera ruido no historico', async () => {
      const productId = await importItem('MLB1000000002', 50);

      const response = await authed(app)
        .post(`/products/${productId}/sync`)
        .expect(200);

      expect(response.body.outcome).toBe('unchanged');
      expect(response.body.priceSnapshotCreated).toBe(false);
      expect(await prisma.priceSnapshot.count()).toBe(1);
    });

    it('atualiza lastSyncedAt mesmo quando nada mais muda', async () => {
      const productId = await importItem('MLB1000000003', 50);
      const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

      await authed(app).post(`/products/${productId}/sync`).expect(200);

      const after = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(after.lastSyncedAt!.getTime()).toBeGreaterThanOrEqual(before.lastSyncedAt!.getTime());
    });

    it('preserva o estado anterior quando o provider falha', async () => {
      const productId = await importItem('MLB1000000004', 123.45);
      const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

      meli.failOn('/items/MLB1000000004', { status: 500 });

      await authed(app).post(`/products/${productId}/sync`).expect(503);

      const after = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(after.currentPrice.toFixed(2)).toBe(before.currentPrice.toFixed(2));
      expect(after.title).toBe(before.title);
      expect(after.lastSyncedAt).toEqual(before.lastSyncedAt);
      expect(await prisma.priceSnapshot.count()).toBe(1);
    });

    it('retorna 404 para produto inexistente', async () => {
      await authed(app)
        .post('/products/0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c/sync')
        .expect(404);
    });
  });

  describe('sync em lote', () => {
    it('reporta total, synced, unchanged e failed', async () => {
      await importItem('MLB2000000001', 100);
      await importItem('MLB2000000002', 200);
      await importItem('MLB2000000003', 300);

      // Um muda de preco, um permanece igual, um falha no provider.
      meli.seedItem({ id: 'MLB2000000001', title: 'Produto MLB2000000001' }, { amount: 150 });
      meli.failOn('/items/MLB2000000003', { status: 500 });

      const response = await authed(app).post('/products/sync').expect(200);

      expect(response.body).toMatchObject({ total: 3, synced: 1, unchanged: 1, failed: 1 });
      expect(response.body.failures).toEqual([
        expect.objectContaining({ marketplaceItemId: 'MLB2000000003', reason: 'unavailable' }),
      ]);
    });

    it('falha parcial nao aborta o lote nem corrompe os demais', async () => {
      await importItem('MLB3000000001', 10);
      await importItem('MLB3000000002', 20);

      meli.failOn('/items/MLB3000000001', { status: 404 });
      meli.seedItem({ id: 'MLB3000000002', title: 'Produto MLB3000000002' }, { amount: 25 });

      const response = await authed(app).post('/products/sync').expect(200);

      expect(response.body).toMatchObject({ total: 2, synced: 1, failed: 1 });
      expect(response.body.failures[0]).toMatchObject({ reason: 'not_found' });

      const survivor = await prisma.product.findFirstOrThrow({
        where: { marketplaceItemId: 'MLB3000000002' },
      });
      expect(survivor.currentPrice.toFixed(2)).toBe('25.00');

      const untouched = await prisma.product.findFirstOrThrow({
        where: { marketplaceItemId: 'MLB3000000001' },
      });
      expect(untouched.currentPrice.toFixed(2)).toBe('10.00');
    });

    it('ignora produtos inativos', async () => {
      const productId = await importItem('MLB4000000001', 10);
      await importItem('MLB4000000002', 20);

      await authed(app)
        .patch(`/products/${productId}`)
        .send({ active: false })
        .expect(200);

      const response = await authed(app).post('/products/sync').expect(200);

      expect(response.body.total).toBe(1);
    });

    it('reaproveita a categoria em memoria durante o lote', async () => {
      await importItem('MLB5000000001', 10);
      await importItem('MLB5000000002', 20);
      const requestsBefore = meli.countRequests('/categories/MLB1051');

      await authed(app).post('/products/sync').expect(200);

      // Dois produtos, mesma categoria: apenas uma consulta adicional no lote.
      expect(meli.countRequests('/categories/MLB1051') - requestsBefore).toBe(1);
    });

    it('devolve relatorio vazio quando nao ha produtos ativos', async () => {
      const response = await authed(app).post('/products/sync').expect(200);

      expect(response.body).toMatchObject({ total: 0, synced: 0, unchanged: 0, failed: 0 });
    });
  });
});
