import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authed, createTestHarness, resetDatabase, useFakeTelegram } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TelegramFakeServer } from './telegram-fake-server';

const money = (value: string) => new Prisma.Decimal(value);

interface Scenario {
  imageUrl?: string | null;
  withLink?: boolean;
  operatorDecision?: 'APPROVED' | 'REJECTED' | null;
  engineStatus?: 'APPROVED' | 'CANDIDATE' | 'IGNORE' | 'NOT_ELIGIBLE';
  channelActive?: boolean;
  channelType?: 'TELEGRAM' | 'FACEBOOK' | 'WHATSAPP';
  externalIdentifier?: string | null;
}

describe('Publicacao no Telegram', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const telegram = new TelegramFakeServer();
  let sequence = 0;

  beforeAll(async () => {
    await telegram.start();
    useFakeTelegram(telegram.baseUrl);
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    telegram.reset();
  });

  afterAll(async () => {
    await app?.close();
    await telegram.stop();
  });

  /** Cenario padrao: tudo pronto para publicar, salvo o que o teste mudar. */
  async function seed(options: Scenario = {}) {
    sequence += 1;

    const product = await prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: `MLB${700000 + sequence}`,
        title: `Echo Dot ${sequence}`,
        category: 'Eletronicos',
        currentPrice: money('700.00'),
        originalPrice: money('1000.00'),
        permalink: 'https://produto.mercadolivre.com.br/MLB-1',
        imageUrl: options.imageUrl === undefined ? 'https://http2.mlstatic.com/x.jpg' : options.imageUrl,
      },
    });

    if (options.withLink !== false) {
      await prisma.affiliateLink.create({
        data: { productId: product.id, url: `https://mercadolivre.com/sec/${sequence}` },
      });
    }

    await prisma.opportunityEvaluation.create({
      data: {
        productId: product.id,
        score: 92,
        status: options.engineStatus ?? 'APPROVED',
        breakdown: {
          discount: { earned: 35, max: 35 },
          priceHistory: { earned: 25, max: 25 },
          popularity: { earned: 20, max: 20 },
          seller: { earned: 10, max: 10 },
          freshness: { earned: 2, max: 10 },
        },
        reasons: ['Desconto oficial de 30%'],
        operatorDecision: options.operatorDecision ?? null,
        operatorDecidedAt: options.operatorDecision ? new Date() : null,
      },
    });

    const offer = await prisma.offer.create({
      data: {
        productId: product.id,
        price: money('700.00'),
        originalPrice: money('1000.00'),
        discountPercentage: money('30.00'),
        status: 'APPROVED',
      },
    });

    const channel = await prisma.channel.create({
      data: {
        type: options.channelType ?? 'TELEGRAM',
        name: `Ofertas ${sequence}`,
        externalIdentifier:
          options.externalIdentifier === undefined ? '@ofertas_brasil' : options.externalIdentifier,
        active: options.channelActive ?? true,
      },
    });

    return { product, offer, channel };
  }

  const publish = (offerId: string, channelId: string) =>
    authed(app).post(`/offers/${offerId}/publish`).send({ channelId });

  describe('caminho feliz', () => {
    it('publica com imagem e persiste o externalMessageId', async () => {
      const { offer, channel } = await seed();

      const response = await publish(offer.id, channel.id).expect(200);

      expect(response.body.delivered).toBe(true);
      expect(response.body.usedPhoto).toBe(true);
      expect(response.body.publication.status).toBe('PUBLISHED');
      expect(response.body.publication.externalMessageId).toEqual(expect.any(String));
      expect(response.body.publication.publishedAt).toEqual(expect.any(String));
      expect(response.body.publication.errorMessage).toBeNull();

      const stored = await prisma.publication.findFirstOrThrow({ where: { offerId: offer.id } });
      expect(stored.status).toBe('PUBLISHED');
      expect(stored.externalMessageId).toBe(response.body.publication.externalMessageId);

      const [call] = telegram.callsTo('sendPhoto');
      expect(call.body.chat_id).toBe('@ofertas_brasil');
      expect(call.body.photo).toBe('https://http2.mlstatic.com/x.jpg');
      expect(String(call.body.caption)).toContain('🔥 OFERTA');
    });

    it('usa sendMessage quando o produto nao tem imagem', async () => {
      const { offer, channel } = await seed({ imageUrl: null });

      const response = await publish(offer.id, channel.id).expect(200);

      expect(response.body.usedPhoto).toBe(false);
      expect(telegram.callsTo('sendPhoto')).toHaveLength(0);
      expect(telegram.callsTo('sendMessage')).toHaveLength(1);
    });

    it('publica o link de afiliado, nunca o permalink do produto', async () => {
      const { offer, channel } = await seed();

      await publish(offer.id, channel.id).expect(200);

      const caption = String(telegram.callsTo('sendPhoto')[0].body.caption);
      expect(caption).toContain('https://mercadolivre.com/sec/');
      expect(caption).not.toContain('produto.mercadolivre.com.br');
    });

    it('nao envia parse_mode: a mensagem e texto puro', async () => {
      const { offer, channel } = await seed();

      await publish(offer.id, channel.id).expect(200);

      expect(telegram.callsTo('sendPhoto')[0].body.parse_mode).toBeUndefined();
    });
  });

  describe('regras de elegibilidade', () => {
    it('recusa publicacao sem link de afiliado ativo', async () => {
      const { offer, channel } = await seed({ withLink: false });

      const response = await publish(offer.id, channel.id).expect(422);

      expect(response.body.message).toContain('link de afiliado');
      expect(telegram.calls).toHaveLength(0);
      expect(await prisma.publication.count()).toBe(0);
    });

    it('recusa publicacao com link existente porem inativo', async () => {
      const { product, offer, channel } = await seed();
      await prisma.affiliateLink.updateMany({
        where: { productId: product.id },
        data: { active: false },
      });

      await publish(offer.id, channel.id).expect(422);
      expect(telegram.calls).toHaveLength(0);
    });

    it('recusa oportunidade que nao esta APPROVED', async () => {
      const { offer, channel } = await seed({ engineStatus: 'CANDIDATE' });

      const response = await publish(offer.id, channel.id).expect(422);

      expect(response.body.message).toContain('APPROVED');
      expect(telegram.calls).toHaveLength(0);
    });

    it('respeita rejeicao humana sobre recomendacao APPROVED', async () => {
      const { offer, channel } = await seed({ operatorDecision: 'REJECTED' });

      await publish(offer.id, channel.id).expect(422);
      expect(telegram.calls).toHaveLength(0);
    });

    it('aceita aprovacao humana sobre recomendacao CANDIDATE', async () => {
      const { offer, channel } = await seed({
        engineStatus: 'CANDIDATE',
        operatorDecision: 'APPROVED',
      });

      await publish(offer.id, channel.id).expect(200);
      expect(telegram.callsTo('sendPhoto')).toHaveLength(1);
    });

    it('recusa canal inativo', async () => {
      const inactive = await seed({ channelActive: false });

      await publish(inactive.offer.id, inactive.channel.id).expect(422);

      expect(telegram.calls).toHaveLength(0);
    });

    it('recusa canal de tipo sem publisher registrado', async () => {
      // WHATSAPP existe no enum, mas nao tem integracao nesta versao.
      const whatsapp = await seed({ channelType: 'WHATSAPP' });

      const response = await publish(whatsapp.offer.id, whatsapp.channel.id).expect(422);

      expect(response.body.message).toContain('WHATSAPP');
      expect(telegram.calls).toHaveLength(0);
    });

    it('recusa canal sem externalIdentifier', async () => {
      const { offer, channel } = await seed({ externalIdentifier: null });

      const response = await publish(offer.id, channel.id).expect(422);

      expect(response.body.message).toContain('externalIdentifier');
      expect(telegram.calls).toHaveLength(0);
    });

    it('valida ids e existencia de oferta e canal', async () => {
      const { offer, channel } = await seed();

      await authed(app)
        .post('/offers/nao-uuid/publish')
        .send({ channelId: channel.id })
        .expect(400);

      await publish(offer.id, '0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c').expect(404);

      await authed(app)
        .post(`/offers/${offer.id}/publish`)
        .send({})
        .expect(400);
    });
  });
});
