import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createTestHarness, resetDatabase, useFakeFacebook } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { FacebookFakeServer } from './facebook-fake-server';

const money = (value: string) => new Prisma.Decimal(value);
const PAGE_ID = '1234567890';
const TOKEN = 'EAA-TEST-PAGE-TOKEN-NAO-REAL';

interface Scenario {
  imageUrl?: string | null;
  withLink?: boolean;
  operatorDecision?: 'APPROVED' | 'REJECTED' | null;
  engineStatus?: 'APPROVED' | 'CANDIDATE';
  channelActive?: boolean;
  externalIdentifier?: string | null;
}

describe('Publicacao no Facebook', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const facebook = new FacebookFakeServer();
  let sequence = 0;

  beforeAll(async () => {
    await facebook.start();
    useFakeFacebook(facebook.baseUrl);
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    facebook.reset();
    facebook.pages.set(PAGE_ID, { id: PAGE_ID, name: 'Achados Tech' });
  });

  afterAll(async () => {
    await app?.close();
    await facebook.stop();
  });

  async function seed(options: Scenario = {}) {
    sequence += 1;

    const product = await prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: `MLB${400000 + sequence}`,
        title: `Echo Dot ${sequence}`,
        currentPrice: money('700.00'),
        originalPrice: money('1000.00'),
        permalink: 'https://produto.mercadolivre.com.br/MLB-1',
        imageUrl:
          options.imageUrl === undefined ? 'https://http2.mlstatic.com/x.jpg' : options.imageUrl,
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
          popularity: { earned: 20, max: 20 },
          priceHistory: { earned: 25, max: 25 },
        },
        reasons: [],
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
        type: 'FACEBOOK',
        name: `Achados ${sequence}`,
        externalIdentifier:
          options.externalIdentifier === undefined ? PAGE_ID : options.externalIdentifier,
        active: options.channelActive ?? true,
      },
    });

    return { product, offer, channel };
  }

  const publish = (offerId: string, channelId: string) =>
    request(app.getHttpServer()).post(`/offers/${offerId}/publish`).send({ channelId });

  describe('caminho feliz', () => {
    it('publica com imagem via /photos e persiste o post_id', async () => {
      const { offer, channel } = await seed();

      const response = await publish(offer.id, channel.id).expect(200);

      expect(response.body).toMatchObject({
        delivered: true,
        usedPhoto: true,
        provider: 'FACEBOOK',
      });
      expect(response.body.publication.status).toBe('PUBLISHED');
      // `/photos` devolve id da foto e post_id; guardamos o post_id.
      expect(response.body.publication.externalMessageId).toBe(`${PAGE_ID}_901`);

      const [call] = facebook.callsTo('/photos');
      expect(call.method).toBe('POST');
      expect(call.node).toBe(`${PAGE_ID}/photos`);
      expect(call.params.url).toBe('https://http2.mlstatic.com/x.jpg');
      expect(call.params.caption).toContain('🔥 Oferta encontrada');
    });

    it('publica sem imagem via /feed com message e link', async () => {
      const { offer, channel } = await seed({ imageUrl: null });

      const response = await publish(offer.id, channel.id).expect(200);

      expect(response.body.usedPhoto).toBe(false);
      expect(facebook.callsTo('/photos')).toHaveLength(0);

      const [call] = facebook.callsTo('/feed');
      expect(call.params.message).toContain('Echo Dot');
      expect(call.params.link).toContain('https://mercadolivre.com/sec/');
    });

    it('publica sempre o link de afiliado, nunca o permalink', async () => {
      const { offer, channel } = await seed();

      await publish(offer.id, channel.id).expect(200);

      const caption = facebook.callsTo('/photos')[0].params.caption;
      expect(caption).toContain('https://mercadolivre.com/sec/');
      expect(caption).not.toContain('produto.mercadolivre.com.br');
    });

    it('envia o token no corpo do POST, nunca no caminho da URL', async () => {
      const { offer, channel } = await seed();

      await publish(offer.id, channel.id).expect(200);

      const [call] = facebook.callsTo('/photos');
      expect(call.token).toBe(TOKEN);
      expect(call.node).not.toContain(TOKEN);
    });
  });

  describe('regras de elegibilidade', () => {
    it('recusa publicacao sem AffiliateLink ativo', async () => {
      const { offer, channel } = await seed({ withLink: false });

      const response = await publish(offer.id, channel.id).expect(422);

      expect(response.body.message).toContain('link de afiliado');
      expect(facebook.calls).toHaveLength(0);
      expect(await prisma.publication.count()).toBe(0);
    });

    it('recusa canal inativo', async () => {
      const { offer, channel } = await seed({ channelActive: false });

      await publish(offer.id, channel.id).expect(422);
      expect(facebook.calls).toHaveLength(0);
    });

    it('recusa canal sem Page ID', async () => {
      const { offer, channel } = await seed({ externalIdentifier: null });

      const response = await publish(offer.id, channel.id).expect(422);

      expect(response.body.message).toContain('externalIdentifier');
      expect(facebook.calls).toHaveLength(0);
    });

    it('recusa oportunidade que nao esta APPROVED', async () => {
      const { offer, channel } = await seed({ engineStatus: 'CANDIDATE' });

      await publish(offer.id, channel.id).expect(422);
      expect(facebook.calls).toHaveLength(0);
    });

    it('respeita a rejeicao humana', async () => {
      const { offer, channel } = await seed({ operatorDecision: 'REJECTED' });

      await publish(offer.id, channel.id).expect(422);
      expect(facebook.calls).toHaveLength(0);
    });
  });

  describe('classificacao de erros da Graph API', () => {
    const cases: [string, number, { message: string; code: number; error_subcode?: number }, number][] =
      [
        [
          'token expirado',
          400,
          { message: 'Error validating access token: Session has expired', code: 190, error_subcode: 463 },
          502,
        ],
        ['token invalido', 400, { message: 'Invalid OAuth access token', code: 190 }, 502],
        [
          'permissao negada',
          400,
          { message: '(#200) Requires pages_manage_posts permission', code: 200 },
          422,
        ],
        ['permissao removida', 400, { message: 'Permission denied', code: 10 }, 422],
        ['page inexistente', 400, { message: 'Object does not exist', code: 803 }, 422],
        ['rate limit', 400, { message: 'Application request limit reached', code: 4 }, 429],
        ['graph indisponivel', 500, { message: 'Internal server error', code: 2 }, 503],
      ];

    it.each(cases)('traduz "%s" em erro acionavel', async (_label, status, error, expected) => {
      const { offer, channel } = await seed({ imageUrl: null });
      facebook.failWithGraphError('/feed', status, error);

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

    it('da diagnostico especifico para token expirado', async () => {
      const { offer, channel } = await seed({ imageUrl: null });
      facebook.failWithGraphError('/feed', 400, {
        message: 'Session has expired',
        code: 190,
        error_subcode: 463,
      });

      const response = await publish(offer.id, channel.id).expect(502);

      expect(response.body.message).toContain('expirado');
      // Nao entra em loop: uma unica chamada.
      expect(facebook.callsTo('/feed')).toHaveLength(1);

      const publication = await prisma.publication.findFirstOrThrow({});
      expect(publication.errorMessage).toContain('expired_token');
    });

    it('nao repete timeout: o resultado e ambiguo', async () => {
      const { offer, channel } = await seed({ imageUrl: null });
      facebook.failOn('/feed', { status: 200, delayMs: 1200 });

      const response = await publish(offer.id, channel.id).expect(502);

      expect(facebook.callsTo('/feed')).toHaveLength(1);
      expect(response.body.message).toContain('pode ter sido publicado');

      const publication = await prisma.publication.findFirstOrThrow({});
      expect(publication.errorMessage).toContain('unknown_outcome');
    });

    it('repete uma unica vez falhas transitorias', async () => {
      const { offer, channel } = await seed({ imageUrl: null });
      facebook.failWithGraphError('/feed', 500, { message: 'Internal error', code: 2 });

      await publish(offer.id, channel.id).expect(503);

      expect(facebook.callsTo('/feed')).toHaveLength(2);
    });

    it('nunca expoe o token em erro, log ou Publication', async () => {
      const { offer, channel } = await seed({ imageUrl: null });
      facebook.failWithGraphError('/feed', 400, { message: 'Invalid OAuth access token', code: 190 });

      const response = await publish(offer.id, channel.id).expect(502);

      expect(JSON.stringify(response.body)).not.toContain(TOKEN);

      const publication = await prisma.publication.findFirstOrThrow({});
      expect(publication.errorMessage).not.toContain(TOKEN);
      // O fake server confirma que o token trafega, mas nao vaza de volta.
      expect(facebook.calls[0].token).toBe(TOKEN);
    });

    it('nao vaza o payload bruto da Meta', async () => {
      const { offer, channel } = await seed({ imageUrl: null });
      facebook.failOn('/feed', {
        status: 400,
        body: { error: { message: 'diagnostico interno da Meta', code: 100, fbtrace_id: 'SECRETO123' } },
      });

      const response = await publish(offer.id, channel.id).expect(422);
      const serialized = JSON.stringify(response.body);

      expect(serialized).not.toContain('SECRETO123');
      expect(serialized).not.toContain('diagnostico interno');
    });
  });

  describe('fallback de imagem', () => {
    it('cai para /feed quando a falha e exclusivamente de midia', async () => {
      const { offer, channel } = await seed();
      facebook.failWithGraphError('/photos', 400, {
        message: 'The image could not be downloaded: url could not be processed',
        code: 100,
      });

      const response = await publish(offer.id, channel.id).expect(200);

      expect(response.body.usedPhoto).toBe(false);
      expect(response.body.publication.status).toBe('PUBLISHED');
      expect(facebook.callsTo('/photos')).toHaveLength(1);
      expect(facebook.callsTo('/feed')).toHaveLength(1);
    });

    it('nao mascara erro que nao e de midia', async () => {
      const { offer, channel } = await seed();
      facebook.failWithGraphError('/photos', 400, {
        message: '(#200) Requires pages_manage_posts permission',
        code: 200,
      });

      await publish(offer.id, channel.id).expect(422);

      expect(facebook.callsTo('/feed')).toHaveLength(0);
    });
  });

  describe('idempotencia e reenvio', () => {
    it('recusa publicar a mesma oferta duas vezes na mesma Page', async () => {
      const { offer, channel } = await seed({ imageUrl: null });

      await publish(offer.id, channel.id).expect(200);
      const second = await publish(offer.id, channel.id).expect(409);

      expect(second.body.message).toContain('ja foi publicada');
      expect(facebook.callsTo('/feed')).toHaveLength(1);
      expect(await prisma.publication.count()).toBe(1);
    });

    it('chamadas concorrentes produzem no maximo uma publicacao externa', async () => {
      const { offer, channel } = await seed({ imageUrl: null });

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => publish(offer.id, channel.id)),
      );

      expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(4);
      expect(facebook.callsTo('/feed')).toHaveLength(1);
      expect(await prisma.publication.count()).toBe(1);
    });

    it('reenvia uma FAILED reaproveitando o mesmo registro', async () => {
      const { offer, channel } = await seed({ imageUrl: null });
      facebook.failWithGraphError('/feed', 500, { message: 'Internal error', code: 2 });

      await publish(offer.id, channel.id).expect(503);
      const failed = await prisma.publication.findFirstOrThrow({});
      expect(failed.status).toBe('FAILED');

      facebook.reset();
      facebook.pages.set(PAGE_ID, { id: PAGE_ID, name: 'Achados Tech' });

      const response = await request(app.getHttpServer())
        .post(`/publications/${failed.id}/retry`)
        .expect(200);

      expect(response.body.publication.id).toBe(failed.id);
      expect(response.body.publication.status).toBe('PUBLISHED');
      expect(response.body.provider).toBe('FACEBOOK');
      expect(await prisma.publication.count()).toBe(1);
    });
  });

  describe('teste de canal', () => {
    it('valida a Page com GET, sem criar post', async () => {
      const { channel } = await seed();

      const response = await request(app.getHttpServer())
        .post(`/channels/${channel.id}/test`)
        .expect(200);

      expect(response.body).toMatchObject({ ok: true, provider: 'FACEBOOK' });
      expect(response.body.destination.name).toBe('Achados Tech');
      expect(facebook.callsTo('/feed')).toHaveLength(0);
      expect(facebook.callsTo('/photos')).toHaveLength(0);
    });

    it('reporta Page que o token nao enxerga', async () => {
      const { channel } = await seed({ externalIdentifier: '999' });

      const response = await request(app.getHttpServer())
        .post(`/channels/${channel.id}/test`)
        .expect(422);

      expect(response.body.message).toContain('Page');
    });
  });
});
