import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import {
  authed,
  createTestHarness,
  resetDatabase,
  useFakeAffiliateBot,
  useFakeTelegram,
} from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AffiliateBotFakeServer } from './affiliate-bot-fake-server';
import { TelegramFakeServer } from './telegram-fake-server';
import { validateGeneratedLink } from '../src/modules/affiliate/generation/link-validator';
import { AffiliateGenerationError } from '../src/modules/affiliate/generation/affiliate-bot.client';

const money = (value: string) => new Prisma.Decimal(value);
const PERMALINK = 'https://produto.mercadolivre.com.br/MLB-1234567890-echo-dot';

describe('validateGeneratedLink', () => {
  const base = {
    url: 'https://mercadolivre.com/sec/ABC123',
    originUrl: PERMALINK,
    tag: 'GARIMPO01',
    expectedTag: 'GARIMPO01',
    productPermalink: PERMALINK,
  };

  it('aceita um link de afiliado bem formado', () => {
    expect(() => validateGeneratedLink(base)).not.toThrow();
  });

  it('recusa URL vazia ou malformada', () => {
    expect(() => validateGeneratedLink({ ...base, url: '' })).toThrow(AffiliateGenerationError);
    expect(() => validateGeneratedLink({ ...base, url: 'nao-e-url' })).toThrow(
      AffiliateGenerationError,
    );
  });

  it('exige HTTPS', () => {
    expect(() => validateGeneratedLink({ ...base, url: 'http://mercadolivre.com/sec/A' })).toThrow(
      /HTTPS/,
    );
  });

  it('recusa host inesperado', () => {
    expect(() =>
      validateGeneratedLink({ ...base, url: 'https://bit.ly/abc' }),
    ).toThrow(/Host inesperado/);
  });

  it('recusa tag diferente da ativa', () => {
    expect(() => validateGeneratedLink({ ...base, tag: 'OUTRA' })).toThrow(/tag devolvida/);
  });

  it('RECUSA URL de produto sem rastreio de afiliado', () => {
    // O caso mais perigoso: publicar isso seria trafego nao monetizado.
    expect(() => validateGeneratedLink({ ...base, url: PERMALINK })).toThrow(/sem rastreio/);
    // Variante com outro host, mesma pagina nao monetizada.
    expect(() =>
      validateGeneratedLink({
        ...base,
        url: 'https://www.mercadolivre.com.br/MLB-1234567890-echo-dot',
      }),
    ).toThrow(/sem rastreio/);
  });

  it('aceita long_url com parametros de rastreio', () => {
    expect(() =>
      validateGeneratedLink({
        ...base,
        url: 'https://www.mercadolivre.com.br/MLB-1234567890-echo-dot?matt_tool=88123&matt_word=GARIMPO01',
      }),
    ).not.toThrow();
  });

  it('recusa origin_url de outro produto', () => {
    expect(() =>
      validateGeneratedLink({
        ...base,
        originUrl: 'https://produto.mercadolivre.com.br/MLB-9999999999-outro',
      }),
    ).toThrow(/origin_url/);
  });

  it('aceita origin_url normalizado do mesmo produto', () => {
    expect(() =>
      validateGeneratedLink({
        ...base,
        originUrl: 'https://www.mercadolivre.com.br/p/MLB1234567890?a=1',
      }),
    ).not.toThrow();
  });
});

describe('Geracao automatica de AffiliateLink', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const bot = new AffiliateBotFakeServer();
  let sequence = 0;

  beforeAll(async () => {
    await bot.start();
    useFakeAffiliateBot(bot.baseUrl);
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    bot.reset();
  });

  afterAll(async () => {
    await app?.close();
    await bot.stop();
  });

  async function seedProduct(options: { permalink?: string | null; active?: boolean } = {}) {
    sequence += 1;

    return prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: `MLB${123456780 + sequence}`,
        title: `Produto ${sequence}`,
        currentPrice: money('700.00'),
        permalink:
          options.permalink === undefined
            ? `https://produto.mercadolivre.com.br/MLB-${123456780 + sequence}-produto`
            : options.permalink,
        active: options.active ?? true,
      },
    });
  }

  const generateFor = (productId: string) =>
    authed(app).post(`/affiliate-links/generate/${productId}`);

  describe('geracao individual', () => {
    it('gera e persiste o link, sem intervencao humana', async () => {
      const product = await seedProduct();

      const response = await generateFor(product.id).expect(200);

      expect(response.body.outcome).toBe('created');
      expect(response.body.url).toMatch(/^https:\/\/mercadolivre\.com\/sec\//);

      const link = await prisma.affiliateLink.findFirstOrThrow({
        where: { productId: product.id },
      });
      expect(link).toMatchObject({
        active: true,
        source: 'MERCADO_LIVRE_AFFILIATE_WEB',
        tag: 'GARIMPO01',
        sourceLabel: 'affiliate-bot',
      });
      expect(link.originUrl).toBe(product.permalink);
      expect(link.generatedAt).not.toBeNull();
      // O link persistido nunca e o permalink.
      expect(link.url).not.toBe(product.permalink);
    });

    it('descobre a tag ativa sozinho e a envia ao provider', async () => {
      const product = await seedProduct();

      await generateFor(product.id).expect(200);

      expect(bot.callsTo('/status')).toHaveLength(1);
      expect(bot.callsTo('/links')[0].body.url).toBe(product.permalink);
    });

    it('e idempotente: com link ativo nao chama o provider de novo', async () => {
      const product = await seedProduct();

      await generateFor(product.id).expect(200);
      const before = bot.callsTo('/links').length;

      const second = await generateFor(product.id).expect(200);

      expect(second.body.outcome).toBe('unchanged');
      expect(bot.callsTo('/links')).toHaveLength(before);
      expect(await prisma.affiliateLink.count({ where: { productId: product.id } })).toBe(1);
    });

    it('nao acumula links ativos ao rotacionar', async () => {
      const product = await seedProduct();
      await generateFor(product.id).expect(200);

      // Provider devolve um link novo para o mesmo produto.
      bot.linkUrl = 'https://mercadolivre.com/sec/NOVO123';
      await authed(app).post(`/affiliate-links/generate/${product.id}`).expect(200);

      const links = await prisma.affiliateLink.findMany({ where: { productId: product.id } });
      const actives = links.filter((link) => link.active);
      expect(actives).toHaveLength(1);
    });

    it('nao sobrescreve link cadastrado manualmente', async () => {
      const product = await seedProduct();
      await prisma.affiliateLink.create({
        data: { productId: product.id, url: 'https://mercadolivre.com/sec/MANUAL' },
      });

      const response = await generateFor(product.id).expect(200);

      expect(response.body.outcome).toBe('unchanged');
      expect(response.body.url).toBe('https://mercadolivre.com/sec/MANUAL');
      expect(bot.callsTo('/links')).toHaveLength(0);
    });

    it('recusa produto sem permalink', async () => {
      const product = await seedProduct({ permalink: null });

      await generateFor(product.id).expect(422);
      expect(await prisma.affiliateLink.count()).toBe(0);
    });
  });

  describe('falhas do provider', () => {
    it('AUTH_REQUIRED vira 409 e nao persiste nada', async () => {
      const product = await seedProduct();
      bot.status = 'AUTH_REQUIRED';

      const response = await generateFor(product.id).expect(409);

      expect(response.body.message).toMatch(/affiliate:login|Sessao/i);
      expect(await prisma.affiliateLink.count()).toBe(0);
    });

    it('bot indisponivel vira 503, sem fallback para o permalink', async () => {
      const product = await seedProduct();
      bot.status = 'UNAVAILABLE';

      await generateFor(product.id).expect(503);

      // A regra mais importante do PR: nunca cair para o permalink.
      expect(await prisma.affiliateLink.count()).toBe(0);
    });

    it('link invalido devolvido pelo provider e recusado', async () => {
      const product = await seedProduct();
      bot.linkUrl = product.permalink;

      await generateFor(product.id).expect(422);
      expect(await prisma.affiliateLink.count()).toBe(0);
    });

    it('tag divergente e recusada', async () => {
      const product = await seedProduct();
      bot.responseTag = 'TAG-DE-OUTRA-CONTA';

      await generateFor(product.id).expect(422);
      expect(await prisma.affiliateLink.count()).toBe(0);
    });

    it('repete uma unica vez em falha transitoria', async () => {
      const product = await seedProduct();
      bot.failOn('/links', { status: 502, body: { failure: 'UNAVAILABLE' } });

      await generateFor(product.id).expect(503);

      expect(bot.callsTo('/links')).toHaveLength(2);
    });

    it('nao repete falha de sessao', async () => {
      const product = await seedProduct();
      bot.failOn('/links', { status: 409, body: { failure: 'AUTH_REQUIRED' } });

      await generateFor(product.id).expect(409);

      expect(bot.callsTo('/links')).toHaveLength(1);
    });
  });

  describe('geracao em lote', () => {
    it('gera para todos os ativos sem link', async () => {
      await seedProduct();
      await seedProduct();
      const withLink = await seedProduct();
      await prisma.affiliateLink.create({
        data: { productId: withLink.id, url: 'https://mercadolivre.com/sec/JATEM' },
      });
      await seedProduct({ active: false });

      const response = await authed(app).post('/affiliate-links/generate').expect(200);

      expect(response.body).toMatchObject({ total: 2, generated: 2, failed: 0 });
      expect(await prisma.affiliateLink.count({ where: { active: true } })).toBe(3);
    });

    it('interrompe cedo quando a sessao cai, e reporta authRequired', async () => {
      await seedProduct();
      await seedProduct();
      bot.status = 'AUTH_REQUIRED';

      const response = await authed(app).post('/affiliate-links/generate').expect(200);

      expect(response.body.authRequired).toBeGreaterThan(0);
      expect(response.body.generated).toBe(0);
      expect(await prisma.affiliateLink.count()).toBe(0);
    });

    it('uma falha nao impede os demais', async () => {
      const broken = await seedProduct({ permalink: null });
      await seedProduct();

      const response = await authed(app).post('/affiliate-links/generate').expect(200);

      expect(response.body.total).toBe(2);
      expect(response.body.generated).toBe(1);
      expect(response.body.failed).toBe(1);
      expect(response.body.failures[0].productId).toBe(broken.id);
    });

    it('reporta o status da sessao', async () => {
      const ready = await authed(app).get('/affiliate-links/generation/status').expect(200);
      expect(ready.body).toMatchObject({ status: 'READY', tag: 'GARIMPO01' });

      bot.status = 'AUTH_REQUIRED';
      const stale = await authed(app).get('/affiliate-links/generation/status').expect(200);
      expect(stale.body.status).toBe('AUTH_REQUIRED');
    });
  });

  describe('protecao e sigilo', () => {
    it('exige sessao administrativa', async () => {
      const product = await seedProduct();

      await request(app.getHttpServer())
        .post(`/affiliate-links/generate/${product.id}`)
        .expect(401);
      await request(app.getHttpServer()).post('/affiliate-links/generate').expect(401);
      await request(app.getHttpServer()).get('/affiliate-links/generation/status').expect(401);
    });

    it('a resposta nao vaza segredo do bot', async () => {
      const product = await seedProduct();

      const response = await generateFor(product.id).expect(200);
      const serialized = JSON.stringify(response.body);

      expect(serialized).not.toMatch(/x-bot-secret|cookie|AFFILIATE_BOT_SECRET/i);
    });
  });
});

/**
 * Amarra as duas pontas do PR: o link que o Garimpo gerou sozinho e exatamente
 * o link que vai para o canal. Sem isso, todo o resto seria trafego nao
 * monetizado.
 */
describe('Do produto ao canal, sem acao humana por produto', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const bot = new AffiliateBotFakeServer();
  const telegram = new TelegramFakeServer();

  beforeAll(async () => {
    await bot.start();
    await telegram.start();
    useFakeAffiliateBot(bot.baseUrl);
    useFakeTelegram(telegram.baseUrl);
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    bot.reset();
    telegram.reset();
  });

  afterAll(async () => {
    await app?.close();
    await bot.stop();
    await telegram.stop();
  });

  it('gera o link, aprova e publica exatamente esse link', async () => {
    const permalink = 'https://produto.mercadolivre.com.br/MLB-7654321000-echo';

    const product = await prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: 'MLB7654321000',
        title: 'Echo Dot 5a geracao',
        currentPrice: money('700.00'),
        originalPrice: money('1000.00'),
        permalink,
        imageUrl: null,
        highlightPosition: 1,
        highlightCheckedAt: new Date(),
        sellerStatus: 'platinum',
        lastSyncedAt: new Date(),
      },
    });
    await prisma.priceSnapshot.createMany({
      data: [
        { productId: product.id, price: money('1000.00'), capturedAt: new Date(Date.now() - 5 * 86_400_000) },
        { productId: product.id, price: money('700.00') },
      ],
    });

    // Sem link, a oportunidade nao e elegivel - mesmo com score alto.
    const before = await authed(app).post(`/products/${product.id}/evaluate`).expect(200);
    expect(before.body.status).toBe('NOT_ELIGIBLE');

    // O Garimpo gera o link sozinho.
    await authed(app).post('/affiliate-links/generate').expect(200);

    const link = await prisma.affiliateLink.findFirstOrThrow({
      where: { productId: product.id, active: true },
    });
    expect(link.source).toBe('MERCADO_LIVRE_AFFILIATE_WEB');
    expect(link.url).not.toBe(permalink);

    const after = await authed(app).post(`/products/${product.id}/evaluate`).expect(200);
    expect(after.body.status).toBe('APPROVED');

    const channel = await prisma.channel.create({
      data: { type: 'TELEGRAM', name: 'Garimpo', externalIdentifier: '@garimpo_teste' },
    });

    await authed(app)
      .post(`/offers/${after.body.offerId}/publish`)
      .send({ channelId: channel.id })
      .expect(200);

    // A mensagem publicada carrega o link gerado - nunca o permalink.
    const text = String(telegram.callsTo('sendMessage')[0].body.text);
    expect(text).toContain(link.url);
    expect(text).not.toContain(permalink);

    const publication = await prisma.publication.findFirstOrThrow({});
    expect(publication.status).toBe('PUBLISHED');
  });
});
