import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createTestHarness, resetDatabase, useFakeTelegram } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TelegramFakeServer } from './telegram-fake-server';

const money = (value: string) => new Prisma.Decimal(value);
const TOKEN = '123456789:TEST-BOT-TOKEN-NAO-REAL';

describe('Falhas, idempotencia e reenvio', () => {
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

  async function seed(imageUrl: string | null = 'https://http2.mlstatic.com/x.jpg') {
    sequence += 1;

    const product = await prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: `MLB${600000 + sequence}`,
        title: `Produto ${sequence}`,
        currentPrice: money('700.00'),
        originalPrice: money('1000.00'),
        imageUrl,
      },
    });

    await prisma.affiliateLink.create({
      data: { productId: product.id, url: `https://mercadolivre.com/sec/${sequence}` },
    });
    await prisma.opportunityEvaluation.create({
      data: {
        productId: product.id,
        score: 92,
        status: 'APPROVED',
        breakdown: { popularity: { earned: 0, max: 20 }, priceHistory: { earned: 25, max: 25 } },
        reasons: [],
      },
    });

    const offer = await prisma.offer.create({
      data: { productId: product.id, price: money('700.00'), status: 'APPROVED' },
    });
    const channel = await prisma.channel.create({
      data: {
        type: 'TELEGRAM',
        name: `Canal ${sequence}`,
        externalIdentifier: '@ofertas_brasil',
      },
    });

    return { offer, channel };
  }

  const publish = (offerId: string, channelId: string) =>
    request(app.getHttpServer()).post(`/offers/${offerId}/publish`).send({ channelId });

  describe('classificacao de erros', () => {
    const cases: [string, number, string, number][] = [
      ['bot nao e administrador', 400, 'Bad Request: not enough rights to send photos', 422],
      ['canal inexistente', 400, 'Bad Request: chat not found', 422],
      ['token invalido', 401, 'Unauthorized', 502],
      ['telegram indisponivel', 500, 'Internal Server Error', 503],
    ];

    it.each(cases)('traduz "%s" em erro acionavel', async (_label, status, description, expected) => {
      const { offer, channel } = await seed(null);
      telegram.failWithDescription('sendMessage', status, description);

      const response = await publish(offer.id, channel.id).expect(expected);

      expect(typeof response.body.message).toBe('string');
      expect(response.body.message.length).toBeGreaterThan(0);

      const publication = await prisma.publication.findFirstOrThrow({
        where: { offerId: offer.id },
      });
      expect(publication.status).toBe('FAILED');
      expect(publication.errorMessage).toBeTruthy();
      expect(publication.publishedAt).toBeNull();
      expect(publication.externalMessageId).toBeNull();
    });

    it('traduz 429 respeitando retry_after e tentando uma unica vez', async () => {
      const { offer, channel } = await seed(null);
      telegram.failOn('sendMessage', {
        status: 429,
        body: { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 1 } },
      });

      await publish(offer.id, channel.id).expect(429);

      // Uma tentativa original + uma retentativa segura. Nada alem disso.
      expect(telegram.callsTo('sendMessage')).toHaveLength(2);
    });

    it('desiste quando o retry_after excede o teto configurado', async () => {
      const { offer, channel } = await seed(null);
      telegram.failOn('sendMessage', {
        status: 429,
        body: { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 3600 } },
      });

      await publish(offer.id, channel.id).expect(429);

      expect(telegram.callsTo('sendMessage')).toHaveLength(1);
    });

    it('nao repete timeout: o resultado e ambiguo', async () => {
      const { offer, channel } = await seed(null);
      telegram.failOn('sendMessage', { status: 200, delayMs: 1200 });

      const response = await publish(offer.id, channel.id).expect(502);

      // Uma unica chamada: repetir poderia duplicar a mensagem no canal.
      expect(telegram.callsTo('sendMessage')).toHaveLength(1);
      expect(response.body.message).toContain('pode ter sido publicada');

      const publication = await prisma.publication.findFirstOrThrow({
        where: { offerId: offer.id },
      });
      expect(publication.status).toBe('FAILED');
      expect(publication.errorMessage).toContain('unknown_outcome');
    });

    it('nunca expoe o token do bot em erro ou log', async () => {
      const { offer, channel } = await seed(null);
      telegram.failWithDescription('sendMessage', 401, 'Unauthorized');

      const response = await publish(offer.id, channel.id).expect(502);

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(TOKEN);
      expect(serialized).not.toContain('TEST-BOT-TOKEN');

      const publication = await prisma.publication.findFirstOrThrow({
        where: { offerId: offer.id },
      });
      expect(publication.errorMessage).not.toContain(TOKEN);

      // O fake server confirma que o token so trafega na URL da Bot API.
      expect(telegram.calls[0].token).toBe(TOKEN);
    });
  });

  describe('fallback de imagem', () => {
    it('cai para texto quando a falha e exclusivamente de midia', async () => {
      const { offer, channel } = await seed();
      telegram.failWithDescription(
        'sendPhoto',
        400,
        'Bad Request: failed to get HTTP URL content',
      );

      const response = await publish(offer.id, channel.id).expect(200);

      expect(response.body.usedPhoto).toBe(false);
      expect(response.body.publication.status).toBe('PUBLISHED');
      expect(telegram.callsTo('sendPhoto')).toHaveLength(1);
      expect(telegram.callsTo('sendMessage')).toHaveLength(1);
    });

    it('nao mascara erro que nao e de midia', async () => {
      const { offer, channel } = await seed();
      telegram.failWithDescription('sendPhoto', 400, 'Bad Request: chat not found');

      await publish(offer.id, channel.id).expect(422);

      // Sem fallback: o problema nao era a imagem.
      expect(telegram.callsTo('sendMessage')).toHaveLength(0);
    });
  });

  describe('idempotencia', () => {
    it('recusa publicar a mesma oferta duas vezes no mesmo canal', async () => {
      const { offer, channel } = await seed(null);

      await publish(offer.id, channel.id).expect(200);
      const second = await publish(offer.id, channel.id).expect(409);

      expect(second.body.message).toContain('ja foi publicada');
      expect(telegram.callsTo('sendMessage')).toHaveLength(1);
      expect(await prisma.publication.count({ where: { offerId: offer.id } })).toBe(1);
    });

    it('chamadas concorrentes produzem no maximo uma publicacao externa', async () => {
      const { offer, channel } = await seed(null);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => publish(offer.id, channel.id)),
      );

      const ok = responses.filter((response) => response.status === 200);
      const conflicts = responses.filter((response) => response.status === 409);

      expect(ok).toHaveLength(1);
      expect(conflicts).toHaveLength(4);
      expect(telegram.callsTo('sendMessage')).toHaveLength(1);
      expect(await prisma.publication.count()).toBe(1);
    });

    it('a garantia esta na constraint do banco, nao no pre-check do servico', async () => {
      const { offer, channel } = await seed(null);
      await publish(offer.id, channel.id).expect(200);

      // Insercao direta, sem passar pelo servico: so a UNIQUE pode barrar.
      await expect(
        prisma.publication.create({
          data: { offerId: offer.id, channelId: channel.id, status: 'PENDING' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      expect(await prisma.publication.count({ where: { offerId: offer.id } })).toBe(1);
    });

    it('permite publicar a mesma oferta em canais diferentes', async () => {
      const { offer, channel } = await seed(null);
      const other = await prisma.channel.create({
        data: { type: 'TELEGRAM', name: 'Segundo canal', externalIdentifier: '@outro' },
      });

      await publish(offer.id, channel.id).expect(200);
      await publish(offer.id, other.id).expect(200);

      expect(await prisma.publication.count({ where: { offerId: offer.id } })).toBe(2);
    });
  });

  describe('reenvio manual', () => {
    it('reprocessa uma FAILED reaproveitando o mesmo registro', async () => {
      const { offer, channel } = await seed(null);
      telegram.failWithDescription('sendMessage', 500, 'Internal Server Error');

      await publish(offer.id, channel.id).expect(503);
      const failed = await prisma.publication.findFirstOrThrow({ where: { offerId: offer.id } });
      expect(failed.status).toBe('FAILED');

      telegram.reset();

      const response = await request(app.getHttpServer())
        .post(`/publications/${failed.id}/retry`)
        .expect(200);

      expect(response.body.publication.id).toBe(failed.id);
      expect(response.body.publication.status).toBe('PUBLISHED');
      expect(response.body.publication.errorMessage).toBeNull();
      // Continua existindo exatamente uma publicacao para (offer, canal).
      expect(await prisma.publication.count({ where: { offerId: offer.id } })).toBe(1);
    });

    it('recusa reenviar uma publicacao ja publicada', async () => {
      const { offer, channel } = await seed(null);
      await publish(offer.id, channel.id).expect(200);

      const publication = await prisma.publication.findFirstOrThrow({
        where: { offerId: offer.id },
      });

      const response = await request(app.getHttpServer())
        .post(`/publications/${publication.id}/retry`)
        .expect(409);

      expect(response.body.message).toContain('FAILED');
      expect(telegram.callsTo('sendMessage')).toHaveLength(1);
    });

    it('retorna 404 para publicacao inexistente', async () => {
      await request(app.getHttpServer())
        .post('/publications/0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c/retry')
        .expect(404);
    });
  });

  describe('publicacao em todos os canais Telegram ativos', () => {
    it('publica nos ativos e ignora inativos e nao-Telegram', async () => {
      const { offer, channel } = await seed(null);
      await prisma.channel.create({
        data: { type: 'TELEGRAM', name: 'Segundo', externalIdentifier: '@dois' },
      });
      await prisma.channel.create({
        data: { type: 'TELEGRAM', name: 'Inativo', externalIdentifier: '@tres', active: false },
      });
      await prisma.channel.create({
        data: { type: 'FACEBOOK', name: 'Pagina', externalIdentifier: 'pagina' },
      });

      const response = await request(app.getHttpServer())
        .post(`/offers/${offer.id}/publish-all`)
        .expect(200);

      expect(response.body).toMatchObject({ total: 2, published: 2, failed: 0 });
      expect(telegram.callsTo('sendMessage')).toHaveLength(2);
      expect(channel.active).toBe(true);
    });

    it('uma falha nao impede a publicacao nos demais canais', async () => {
      const { offer } = await seed(null);
      await prisma.channel.create({
        data: { type: 'TELEGRAM', name: 'Segundo', externalIdentifier: '@dois' },
      });

      // Falha apenas na primeira chamada; a segunda passa.
      telegram.failOn('sendMessage', {
        status: 400,
        body: { ok: false, description: 'Bad Request: chat not found' },
        remaining: 1,
      });

      const response = await request(app.getHttpServer())
        .post(`/offers/${offer.id}/publish-all`)
        .expect(200);

      expect(response.body).toMatchObject({ total: 2, published: 1, failed: 1 });
    });
  });

  describe('teste de canal', () => {
    it('valida o canal com getChat, sem publicar nada', async () => {
      const { channel } = await seed(null);

      const response = await request(app.getHttpServer())
        .post(`/channels/${channel.id}/test`)
        .expect(200);

      expect(response.body).toMatchObject({ ok: true });
      expect(response.body.chat.title).toBe('Ofertas Brasil');
      expect(telegram.callsTo('getChat')).toHaveLength(1);
      expect(telegram.callsTo('sendMessage')).toHaveLength(0);
      expect(telegram.callsTo('sendPhoto')).toHaveLength(0);
    });

    it('reporta canal que o bot nao enxerga', async () => {
      const { channel } = await seed(null);
      telegram.failWithDescription('getChat', 400, 'Bad Request: chat not found');

      const response = await request(app.getHttpServer())
        .post(`/channels/${channel.id}/test`)
        .expect(422);

      expect(response.body.message).toContain('nao encontrado');
    });
  });
});
