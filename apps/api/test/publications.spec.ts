import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { productPayload } from './fixtures';

/**
 * A escrita de publicacoes ainda nao e exposta pela API (chega junto com os
 * workers de distribuicao). Aqui validamos a integridade do modelo no banco e
 * a leitura administrativa.
 */
describe('Publications', () => {
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

  async function seedPublication() {
    const product = await prisma.product.create({
      data: {
        ...productPayload(),
        currentPrice: new Prisma.Decimal('199.90'),
        originalPrice: new Prisma.Decimal('299.90'),
      },
    });

    const offer = await prisma.offer.create({
      data: { productId: product.id, price: new Prisma.Decimal('149.90') },
    });

    const channel = await prisma.channel.create({
      data: { type: 'TELEGRAM', name: 'Ofertas Brasil' },
    });

    const publication = await prisma.publication.create({
      data: { offerId: offer.id, channelId: channel.id },
    });

    return { product, offer, channel, publication };
  }

  it('nasce com status PENDING e sem dados de publicacao externa', async () => {
    const { publication } = await seedPublication();

    expect(publication.status).toBe('PENDING');
    expect(publication.externalMessageId).toBeNull();
    expect(publication.publishedAt).toBeNull();
    expect(publication.errorMessage).toBeNull();
  });

  it('lista publicacoes com canal e oferta relacionados', async () => {
    const { channel, offer } = await seedPublication();

    const response = await request(app.getHttpServer()).get('/publications').expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0]).toMatchObject({
      status: 'PENDING',
      offerId: offer.id,
      channelId: channel.id,
      channel: { id: channel.id, name: channel.name, type: 'TELEGRAM' },
      offer: { id: offer.id, productId: offer.productId },
    });
  });

  it('filtra publicacoes por status e por canal', async () => {
    const { channel } = await seedPublication();

    await request(app.getHttpServer())
      .get(`/publications?channelId=${channel.id}`)
      .expect(200)
      .expect((response) => expect(response.body.total).toBe(1));

    await request(app.getHttpServer())
      .get('/publications?status=PUBLISHED')
      .expect(200)
      .expect((response) => expect(response.body.total).toBe(0));
  });

  it('recusa publicacao apontando para oferta inexistente', async () => {
    const channel = await prisma.channel.create({
      data: { type: 'FACEBOOK', name: 'Pagina Ofertas' },
    });

    await expect(
      prisma.publication.create({
        data: { offerId: '0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c', channelId: channel.id },
      }),
    ).rejects.toThrow();
  });

  it('impede excluir um canal que ainda possui publicacoes', async () => {
    const { channel } = await seedPublication();

    await expect(prisma.channel.delete({ where: { id: channel.id } })).rejects.toThrow();
    expect(await prisma.channel.count()).toBe(1);
  });

  it('remove publicacoes em cascata quando a oferta e excluida', async () => {
    const { offer } = await seedPublication();

    await prisma.offer.delete({ where: { id: offer.id } });

    expect(await prisma.publication.count()).toBe(0);
  });
});
