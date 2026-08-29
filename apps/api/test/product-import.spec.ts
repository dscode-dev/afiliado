import { INestApplication } from '@nestjs/common';
import { authed, createTestHarness, resetDatabase, useFakeMarketplace } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MeliFakeServer } from './meli-fake-server';

const ITEM_ID = 'MLB1234567890';

describe('Importacao de produto do Mercado Livre', () => {
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
    meli.seedItem(
      {
        id: ITEM_ID,
        title: 'Echo Dot 5a geracao',
        category_id: 'MLB1051',
        currency_id: 'BRL',
        permalink: 'https://produto.mercadolivre.com.br/MLB-1234567890',
        seller_id: 987654321,
        status: 'active',
        pictures: [{ secure_url: 'https://http2.mlstatic.com/full.jpg' }],
      },
      { amount: 799.9, regular: 999.9 },
    );
  });

  afterAll(async () => {
    await app?.close();
    await meli.stop();
  });

  const importItem = (id = ITEM_ID) =>
    authed(app).post('/products/import').send({ marketplaceItemId: id });

  it('cria o produto com dados reais e resolve o nome da categoria', async () => {
    const response = await importItem().expect(201);

    expect(response.body.outcome).toBe('created');
    expect(response.body.priceSnapshotCreated).toBe(true);
    expect(response.body.product).toMatchObject({
      marketplace: 'MERCADO_LIVRE',
      marketplaceItemId: ITEM_ID,
      title: 'Echo Dot 5a geracao',
      category: 'Celulares e Telefones',
      categoryId: 'MLB1051',
      currencyId: 'BRL',
      sellerId: '987654321',
      permalink: 'https://produto.mercadolivre.com.br/MLB-1234567890',
      imageUrl: 'https://http2.mlstatic.com/full.jpg',
      marketplaceStatus: 'active',
      currentPrice: '799.90',
      originalPrice: '999.90',
      active: true,
    });
    expect(response.body.product.lastSyncedAt).toEqual(expect.any(String));
  });

  it('grava o primeiro PriceSnapshot na importacao', async () => {
    await importItem().expect(201);

    const snapshots = await prisma.priceSnapshot.findMany();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].price.toFixed(2)).toBe('799.90');
    expect(snapshots[0].originalPrice?.toFixed(2)).toBe('999.90');
    expect(snapshots[0].currencyId).toBe('BRL');
  });

  it('e idempotente: reimportar nao duplica produto nem snapshot', async () => {
    await importItem().expect(201);
    const second = await importItem().expect(201);

    expect(second.body.outcome).toBe('unchanged');
    expect(second.body.priceSnapshotCreated).toBe(false);
    expect(await prisma.product.count()).toBe(1);
    expect(await prisma.priceSnapshot.count()).toBe(1);
  });

  it('atualiza o produto existente quando os dados mudam no marketplace', async () => {
    const created = await importItem().expect(201);

    meli.seedItem(
      {
        id: ITEM_ID,
        title: 'Echo Dot 5a geracao - Preto',
        category_id: 'MLB1051',
        currency_id: 'BRL',
        status: 'active',
        pictures: [{ secure_url: 'https://http2.mlstatic.com/nova.jpg' }],
      },
      { amount: 699.0, regular: 999.9 },
    );

    const updated = await importItem().expect(201);

    expect(updated.body.outcome).toBe('updated');
    expect(updated.body.product.id).toBe(created.body.product.id);
    expect(updated.body.product.title).toBe('Echo Dot 5a geracao - Preto');
    expect(updated.body.product.currentPrice).toBe('699.00');
    expect(updated.body.product.imageUrl).toBe('https://http2.mlstatic.com/nova.jpg');
    expect(await prisma.product.count()).toBe(1);
  });

  it('cria novo snapshot apenas quando o preco muda', async () => {
    await importItem().expect(201);
    await importItem().expect(201);
    expect(await prisma.priceSnapshot.count()).toBe(1);

    meli.seedItem({ id: ITEM_ID, title: 'Echo Dot 5a geracao' }, { amount: 749.0, regular: 999.9 });
    const changed = await importItem().expect(201);

    expect(changed.body.priceSnapshotCreated).toBe(true);
    expect(await prisma.priceSnapshot.count()).toBe(2);

    // Preco estavel novamente: nenhum ponto novo no historico.
    await importItem().expect(201);
    expect(await prisma.priceSnapshot.count()).toBe(2);
  });

  it('trata mudanca apenas no preco original como mudanca de preco', async () => {
    await importItem().expect(201);

    meli.seedItem({ id: ITEM_ID, title: 'Echo Dot 5a geracao' }, { amount: 799.9, regular: 1099.0 });
    await importItem().expect(201);

    expect(await prisma.priceSnapshot.count()).toBe(2);
  });

  it('usa a API oficial de precos, nao o campo legado de /items', async () => {
    // O campo `price` do item diverge de proposito do valor oficial de /prices.
    meli.items.set(ITEM_ID, { ...meli.items.get(ITEM_ID)!, price: 1 });

    const response = await importItem().expect(201);

    expect(response.body.product.currentPrice).toBe('799.90');
    expect(meli.countRequests(`/items/${ITEM_ID}/prices`)).toBe(1);
  });

  it('desativa o monitoramento quando o anuncio e encerrado', async () => {
    await importItem().expect(201);

    meli.seedItem(
      { id: ITEM_ID, title: 'Echo Dot 5a geracao', status: 'closed' },
      { amount: 799.9, regular: 999.9 },
    );
    const closed = await importItem().expect(201);

    expect(closed.body.product.marketplaceStatus).toBe('closed');
    expect(closed.body.product.active).toBe(false);
  });

  it('nao desativa o monitoramento por pausa temporaria', async () => {
    await importItem().expect(201);

    meli.seedItem(
      { id: ITEM_ID, title: 'Echo Dot 5a geracao', status: 'paused' },
      { amount: 799.9, regular: 999.9 },
    );
    const paused = await importItem().expect(201);

    expect(paused.body.product.marketplaceStatus).toBe('paused');
    expect(paused.body.product.active).toBe(true);
  });

  it('rejeita id fora do padrao do Mercado Livre sem chamar o provider', async () => {
    await authed(app)
      .post('/products/import')
      .send({ marketplaceItemId: 'nao-e-id' })
      .expect(400);

    await authed(app)
      .post('/products/import')
      .send({ marketplaceItemId: 'MLA1234567890' })
      .expect(400);

    expect(meli.requests).toHaveLength(0);
  });

  it('recusa item que pertence a outro site', async () => {
    meli.items.set('MLB5555555555', {
      id: 'MLB5555555555',
      site_id: 'MLA',
      title: 'Produto argentino',
    });
    meli.prices.set('MLB5555555555', {
      prices: [{ type: 'standard', amount: 10, currency_id: 'ARS' }],
    });

    await importItem('MLB5555555555').expect(422);
    expect(await prisma.product.count()).toBe(0);
  });

  it('nao cria Offer nem AffiliateLink automaticamente', async () => {
    await importItem().expect(201);

    expect(await prisma.offer.count()).toBe(0);
    expect(await prisma.affiliateLink.count()).toBe(0);
  });
});
