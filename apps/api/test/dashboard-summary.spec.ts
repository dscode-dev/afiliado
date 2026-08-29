import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authed, createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { productPayload } from './fixtures';

describe('GET /analytics/summary', () => {
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

  it('conta apenas registros ativos e ofertas ainda abertas', async () => {
    const active = await prisma.product.create({
      data: { ...productPayload(), currentPrice: new Prisma.Decimal('10.00') },
    });
    await prisma.product.create({
      data: { ...productPayload(), currentPrice: new Prisma.Decimal('10.00'), active: false },
    });

    await prisma.affiliateLink.create({
      data: { productId: active.id, url: 'https://mercadolivre.com/sec/um' },
    });
    await prisma.affiliateLink.create({
      data: { productId: active.id, url: 'https://mercadolivre.com/sec/dois', active: false },
    });

    const channel = await prisma.channel.create({
      data: { type: 'TELEGRAM', name: 'Ofertas Brasil' },
    });
    await prisma.channel.create({
      data: { type: 'WHATSAPP', name: 'Grupo', active: false },
    });

    const open = await prisma.offer.create({
      data: { productId: active.id, price: new Prisma.Decimal('9.00'), status: 'CANDIDATE' },
    });
    await prisma.offer.create({
      data: { productId: active.id, price: new Prisma.Decimal('8.00'), status: 'EXPIRED' },
    });
    await prisma.offer.create({
      data: { productId: active.id, price: new Prisma.Decimal('7.00'), status: 'REJECTED' },
    });

    await prisma.publication.create({ data: { offerId: open.id, channelId: channel.id } });

    const response = await authed(app).get('/analytics/summary').expect(200);

    expect(response.body).toEqual({
      activeProducts: 1,
      activeAffiliateLinks: 1,
      activeChannels: 1,
      openOffers: 1,
      publications: 1,
      pendingPublications: 1,
    });
  });

  it('devolve zeros com a base vazia', async () => {
    const response = await authed(app).get('/analytics/summary').expect(200);

    expect(response.body).toEqual({
      activeProducts: 0,
      activeAffiliateLinks: 0,
      activeChannels: 0,
      openOffers: 0,
      publications: 0,
      pendingPublications: 0,
    });
  });
});
