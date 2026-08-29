import { INestApplication } from '@nestjs/common';
import { authed, createTestHarness, resetDatabase, useFakeMarketplace } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MeliFakeServer } from './meli-fake-server';

const CATEGORY = 'MLB1051';
const PATH = `/marketplace/mercado-livre/highlights?categoryId=${CATEGORY}`;

describe('GET /marketplace/mercado-livre/highlights', () => {
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

  it('devolve o ranking oficial com os itens resolvidos', async () => {
    meli.highlights.set(CATEGORY, [
      { id: 'MLB1000000002', position: 2, type: 'ITEM' },
      { id: 'MLB1000000001', position: 1, type: 'ITEM' },
    ]);
    meli.items.set('MLB1000000001', {
      id: 'MLB1000000001',
      title: 'Celular A',
      thumbnail: 'https://http2.mlstatic.com/a.jpg',
      permalink: 'https://produto.mercadolivre.com.br/a',
      price: 1999.9,
    });
    meli.items.set('MLB1000000002', { id: 'MLB1000000002', title: 'Celular B', price: 999 });

    const response = await authed(app).get(PATH).expect(200);

    expect(response.body).toMatchObject({
      siteId: 'MLB',
      categoryId: CATEGORY,
      categoryName: 'Celulares e Telefones',
      total: 2,
    });
    expect(response.body.data[0]).toMatchObject({
      position: 1,
      id: 'MLB1000000001',
      itemId: 'MLB1000000001',
      title: 'Celular A',
      imageUrl: 'https://http2.mlstatic.com/a.jpg',
      price: '1999.90',
    });
    expect(response.body.data[1].position).toBe(2);
  });

  it('resolve todos os anuncios com um unico multiget', async () => {
    meli.highlights.set(
      CATEGORY,
      Array.from({ length: 5 }, (_, index) => ({
        id: `MLB200000000${index}`,
        position: index + 1,
        type: 'ITEM',
      })),
    );
    for (let index = 0; index < 5; index += 1) {
      meli.items.set(`MLB200000000${index}`, {
        id: `MLB200000000${index}`,
        title: `Item ${index}`,
      });
    }

    await authed(app).get(PATH).expect(200);

    expect(meli.countRequests('/items?ids=')).toBe(1);
  });

  it('resolve entradas de catalogo pelo vencedor do buy box', async () => {
    meli.highlights.set(CATEGORY, [{ id: 'MLB9000000001', position: 1, type: 'PRODUCT' }]);
    meli.catalogProducts.set('MLB9000000001', {
      id: 'MLB9000000001',
      name: 'iPhone 15 128GB',
      pictures: [{ secure_url: 'https://http2.mlstatic.com/iphone.jpg' }],
      buy_box_winner: { item_id: 'MLB1234567890', price: 5499, currency_id: 'BRL' },
    });

    const response = await authed(app).get(PATH).expect(200);

    expect(response.body.data[0]).toMatchObject({
      type: 'PRODUCT',
      id: 'MLB9000000001',
      itemId: 'MLB1234567890',
      title: 'iPhone 15 128GB',
      imageUrl: 'https://http2.mlstatic.com/iphone.jpg',
      price: '5499.00',
    });
  });

  it('mantem a linha mesmo quando o item nao resolve', async () => {
    meli.highlights.set(CATEGORY, [{ id: 'MLB7777777777', position: 1, type: 'ITEM' }]);

    const response = await authed(app).get(PATH).expect(200);

    expect(response.body.data[0]).toMatchObject({
      id: 'MLB7777777777',
      itemId: 'MLB7777777777',
      title: null,
    });
  });

  it('limita a resposta aos 20 primeiros do ranking', async () => {
    meli.highlights.set(
      CATEGORY,
      Array.from({ length: 30 }, (_, index) => ({
        id: `MLB30000000${String(index).padStart(2, '0')}`,
        position: index + 1,
        type: 'ITEM',
      })),
    );

    const response = await authed(app).get(PATH).expect(200);

    expect(response.body.total).toBe(20);
  });

  it('nao persiste nada ao consultar a descoberta', async () => {
    meli.highlights.set(CATEGORY, [{ id: 'MLB1000000001', position: 1, type: 'ITEM' }]);
    meli.items.set('MLB1000000001', { id: 'MLB1000000001', title: 'Celular A' });

    await authed(app).get(PATH).expect(200);

    expect(await prisma.product.count()).toBe(0);
  });

  it('valida o formato do categoryId antes de chamar o provider', async () => {
    await authed(app)
      .get('/marketplace/mercado-livre/highlights?categoryId=abc')
      .expect(400);
    await authed(app)
      .get('/marketplace/mercado-livre/highlights?categoryId=MLA1051')
      .expect(400);
    await authed(app)
      .get('/marketplace/mercado-livre/highlights')
      .expect(400);

    expect(meli.requests).toHaveLength(0);
  });

  it('traduz categoria inexistente em 404', async () => {
    await authed(app)
      .get('/marketplace/mercado-livre/highlights?categoryId=MLB0000')
      .expect(404);
  });

  it('sobrevive a falha ao resolver o nome da categoria', async () => {
    meli.highlights.set(CATEGORY, [{ id: 'MLB1000000001', position: 1, type: 'ITEM' }]);
    meli.items.set('MLB1000000001', { id: 'MLB1000000001', title: 'Celular A' });
    meli.failOn(`/categories/${CATEGORY}`, { status: 500 });

    const response = await authed(app).get(PATH).expect(200);

    expect(response.body.categoryName).toBeNull();
    expect(response.body.data).toHaveLength(1);
  });
});
