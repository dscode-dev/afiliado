import { INestApplication } from '@nestjs/common';
import { authed, createTestHarness, resetDatabase, useFakeMarketplace } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MeliFakeServer } from './meli-fake-server';

const CATEGORY = 'MLB1051';

describe('Sinais de popularidade e vendedor', () => {
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
    meli.categories.set(CATEGORY, { id: CATEGORY, name: 'Celulares e Telefones' });
  });

  afterAll(async () => {
    await app?.close();
    await meli.stop();
  });

  async function importItem(id: string, sellerId = 111): Promise<string> {
    meli.seedItem(
      { id, title: `Produto ${id}`, category_id: CATEGORY, seller_id: sellerId, status: 'active' },
      { amount: 700, regular: 1000 },
    );

    const response = await authed(app)
      .post('/products/import')
      .send({ marketplaceItemId: id })
      .expect(201);

    return response.body.product.id;
  }

  describe('reputacao do vendedor na sincronizacao', () => {
    it('coleta reputacao e status de power seller', async () => {
      meli.seedSeller('111', '5_green', 'platinum');

      const productId = await importItem('MLB1000000001');
      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

      expect(product.sellerReputationLevel).toBe('5_green');
      expect(product.sellerStatus).toBe('platinum');
    });

    it('nao quebra a importacao quando o vendedor nao resolve', async () => {
      // Nenhum vendedor cadastrado: /users/:id responde 404.
      const productId = await importItem('MLB1000000002');
      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

      expect(product.sellerReputationLevel).toBeNull();
      expect(product.sellerStatus).toBeNull();
      expect(product.title).toBe('Produto MLB1000000002');
    });

    it('consulta cada vendedor uma unica vez por lote', async () => {
      meli.seedSeller('111', '5_green', 'gold');
      await importItem('MLB1000000003', 111);
      await importItem('MLB1000000004', 111);

      const before = meli.countRequests('/users/111');
      await authed(app).post('/products/sync').expect(200);

      expect(meli.countRequests('/users/111') - before).toBe(1);
    });
  });

  describe('POST /products/refresh-popularity', () => {
    it('grava a posicao dos produtos presentes no ranking', async () => {
      meli.seedSeller('111', '5_green');
      const rankedId = await importItem('MLB1000000005');
      const unrankedId = await importItem('MLB1000000006');

      meli.highlights.set(CATEGORY, [
        { id: 'MLB1000000005', position: 2, type: 'ITEM' },
        { id: 'MLB9999999999', position: 1, type: 'ITEM' },
      ]);

      const response = await authed(app)
        .post('/products/refresh-popularity')
        .expect(200);

      expect(response.body).toMatchObject({
        categories: 1,
        productsChecked: 2,
        productsRanked: 1,
      });

      const ranked = await prisma.product.findUniqueOrThrow({ where: { id: rankedId } });
      const unranked = await prisma.product.findUniqueOrThrow({ where: { id: unrankedId } });

      expect(ranked.highlightPosition).toBe(2);
      expect(ranked.highlightCheckedAt).not.toBeNull();
      // Ausente do ranking: verificado, porem sem posicao.
      expect(unranked.highlightPosition).toBeNull();
      expect(unranked.highlightCheckedAt).not.toBeNull();
    });

    it('faz uma unica chamada por categoria, nao por produto', async () => {
      await importItem('MLB1000000007');
      await importItem('MLB1000000008');
      await importItem('MLB1000000009');
      meli.highlights.set(CATEGORY, [{ id: 'MLB1000000007', position: 1, type: 'ITEM' }]);

      const before = meli.countRequests(`/highlights/MLB/category/${CATEGORY}`);
      await authed(app).post('/products/refresh-popularity').expect(200);

      expect(meli.countRequests(`/highlights/MLB/category/${CATEGORY}`) - before).toBe(1);
    });

    it('reporta a categoria que falhou sem abortar a operacao', async () => {
      await importItem('MLB1000000010');
      meli.failOn(`/highlights/MLB/category/${CATEGORY}`, { status: 500 });

      const response = await authed(app)
        .post('/products/refresh-popularity')
        .expect(200);

      expect(response.body.productsChecked).toBe(0);
      expect(response.body.failedCategories).toEqual([
        expect.objectContaining({ categoryId: CATEGORY, reason: 'unavailable' }),
      ]);
    });

    it('alimenta o componente de popularidade da avaliacao', async () => {
      meli.seedSeller('111', '5_green', 'platinum');
      const productId = await importItem('MLB1000000011');
      await prisma.affiliateLink.create({
        data: { productId, url: 'https://mercadolivre.com/sec/abc' },
      });

      const before = await authed(app)
        .post(`/products/${productId}/evaluate`)
        .expect(200);
      expect(before.body.breakdown.popularity.earned).toBe(0);

      meli.highlights.set(CATEGORY, [{ id: 'MLB1000000011', position: 1, type: 'ITEM' }]);
      await authed(app).post('/products/refresh-popularity').expect(200);

      const after = await authed(app)
        .post(`/products/${productId}/evaluate`)
        .expect(200);

      expect(after.body.breakdown.popularity.earned).toBe(20);
      expect(after.body.score).toBe(before.body.score + 20);
    });
  });
});
