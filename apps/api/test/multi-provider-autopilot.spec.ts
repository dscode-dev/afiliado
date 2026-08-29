import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import {
  createTestHarness,
  resetDatabase,
  useFakeFacebook,
  useFakeMarketplace,
  useFakeTelegram,
} from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AutomationOrchestrator } from '../src/modules/automation/automation.orchestrator';
import { FixedClock } from '../src/modules/automation/clock';
import { FacebookFakeServer } from './facebook-fake-server';
import { MeliFakeServer } from './meli-fake-server';
import { TelegramFakeServer } from './telegram-fake-server';

const money = (value: string) => new Prisma.Decimal(value);
/** 15:00 em Sao Paulo: dentro da janela padrao. */
const NOON_SP = new Date('2026-06-15T18:00:00Z');
const PAGE_ID = '5550001';

describe('Autopilot com Telegram e Facebook', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orchestrator: AutomationOrchestrator;
  const meli = new MeliFakeServer();
  const telegram = new TelegramFakeServer();
  const facebook = new FacebookFakeServer();
  const clock = new FixedClock(NOON_SP);
  let sequence = 0;

  beforeAll(async () => {
    await meli.start();
    await telegram.start();
    await facebook.start();
    useFakeMarketplace(meli.baseUrl);
    useFakeTelegram(telegram.baseUrl);
    useFakeFacebook(facebook.baseUrl);

    // Ambos os destinos ligados antes de criar o container.
    process.env.TELEGRAM_AUTO_PUBLISH_ENABLED = 'true';
    process.env.FACEBOOK_AUTO_PUBLISH_ENABLED = 'true';

    ({ app, prisma } = await createTestHarness({ clock }));
    orchestrator = app.get(AutomationOrchestrator);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    meli.reset();
    telegram.reset();
    facebook.reset();
    clock.set(NOON_SP);
    facebook.pages.set(PAGE_ID, { id: PAGE_ID, name: 'Achados Tech' });
  });

  afterAll(async () => {
    await app?.close();
    await meli.stop();
    await telegram.stop();
    await facebook.stop();
    process.env.TELEGRAM_AUTO_PUBLISH_ENABLED = 'false';
    process.env.FACEBOOK_AUTO_PUBLISH_ENABLED = 'false';
  });

  async function seedApproved(score = 95) {
    sequence += 1;
    const now = clock.now();

    const product = await prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: `MLB${300000 + sequence}`,
        title: `Produto ${sequence}`,
        currentPrice: money(`${700 + sequence}.00`),
        originalPrice: money('1000.00'),
        imageUrl: null,
      },
    });

    await prisma.affiliateLink.create({
      data: { productId: product.id, url: `https://mercadolivre.com/sec/${sequence}` },
    });
    await prisma.opportunityEvaluation.create({
      data: {
        productId: product.id,
        score,
        status: 'APPROVED',
        breakdown: { popularity: { earned: 20, max: 20 }, priceHistory: { earned: 25, max: 25 } },
        reasons: [],
        evaluatedAt: now,
      },
    });

    const offer = await prisma.offer.create({
      data: {
        productId: product.id,
        price: money(`${700 + sequence}.00`),
        status: 'APPROVED',
        detectedAt: now,
      },
    });

    return { product, offer };
  }

  const seedTelegram = (name = 'Ofertas Tech') =>
    prisma.channel.create({
      data: { type: 'TELEGRAM', name, externalIdentifier: `@${name.replace(/\s/g, '_')}` },
    });

  const seedFacebook = (name = 'Achados Tech') =>
    prisma.channel.create({
      data: { type: 'FACEBOOK', name, externalIdentifier: PAGE_ID },
    });

  const distribute = async () => {
    const summary = await orchestrator.runDistribution();
    expect(summary.distribution).not.toBeNull();

    return summary.distribution as NonNullable<typeof summary.distribution>;
  };

  const publicationsBy = async (type: 'TELEGRAM' | 'FACEBOOK') =>
    prisma.publication.count({ where: { channel: { type }, status: 'PUBLISHED' } });

  it('publica a mesma oferta nos dois destinos e nao repete na reexecucao', async () => {
    await seedApproved();
    await seedTelegram();
    await seedFacebook();

    const first = await distribute();

    expect(first.published).toBe(2);
    expect(await publicationsBy('TELEGRAM')).toBe(1);
    expect(await publicationsBy('FACEBOOK')).toBe(1);
    expect(telegram.callsTo('sendMessage')).toHaveLength(1);
    expect(facebook.callsTo('/feed')).toHaveLength(1);

    telegram.reset();
    facebook.reset();
    facebook.pages.set(PAGE_ID, { id: PAGE_ID, name: 'Achados Tech' });

    const second = await distribute();

    expect(second.published).toBe(0);
    expect(telegram.calls).toHaveLength(0);
    expect(facebook.calls).toHaveLength(0);
    expect(await prisma.publication.count()).toBe(2);
  });

  it('aplica quotas independentes por provider', async () => {
    // Defaults: Telegram 2/h, Facebook 1/h.
    await seedApproved(99);
    await seedApproved(98);
    await seedApproved(97);
    await seedTelegram();
    await seedFacebook();

    const summary = await distribute();

    expect(await publicationsBy('TELEGRAM')).toBe(2);
    expect(await publicationsBy('FACEBOOK')).toBe(1);

    const byProvider = Object.fromEntries(
      summary.channels.map((channel) => [channel.provider, channel.published]),
    );
    expect(byProvider).toEqual({ TELEGRAM: 2, FACEBOOK: 1 });
  });

  it('publicacao no Telegram nao consome quota do Facebook', async () => {
    const { offer } = await seedApproved();
    const telegramChannel = await seedTelegram();
    await seedFacebook();

    // Telegram ja publicou antes do ciclo.
    await request(app.getHttpServer())
      .post(`/offers/${offer.id}/publish`)
      .send({ channelId: telegramChannel.id })
      .expect(200);

    const summary = await distribute();

    // A quota do Facebook continua intacta: ele publica normalmente.
    expect(summary.published).toBe(1);
    expect(await publicationsBy('FACEBOOK')).toBe(1);
    expect(await publicationsBy('TELEGRAM')).toBe(1);
  });

  it('falha no Facebook nao impede a publicacao no Telegram', async () => {
    await seedApproved();
    await seedTelegram();
    await seedFacebook();
    facebook.failWithGraphError('/feed', 400, {
      message: '(#200) Requires pages_manage_posts permission',
      code: 200,
    });

    const summary = await distribute();

    expect(summary.published).toBe(1);
    expect(summary.publishFailed).toBe(1);
    expect(summary.failures[0].provider).toBe('FACEBOOK');

    expect(await publicationsBy('TELEGRAM')).toBe(1);
    expect(await publicationsBy('FACEBOOK')).toBe(0);

    const failed = await prisma.publication.findFirstOrThrow({
      where: { channel: { type: 'FACEBOOK' } },
    });
    expect(failed.status).toBe('FAILED');
  });

  it('falha no Telegram nao impede a publicacao no Facebook', async () => {
    await seedApproved();
    await seedTelegram();
    await seedFacebook();
    telegram.failWithDescription('sendMessage', 400, 'Bad Request: chat not found');

    const summary = await distribute();

    expect(summary.published).toBe(1);
    expect(summary.publishFailed).toBe(1);
    expect(await publicationsBy('FACEBOOK')).toBe(1);
    expect(await publicationsBy('TELEGRAM')).toBe(0);
  });

  it('respeita o score minimo especifico de cada provider', async () => {
    process.env.FACEBOOK_MIN_SCORE = '95';
    const isolated = await createTestHarness({ clock });

    try {
      await resetDatabase(isolated.prisma);
      facebook.reset();
      telegram.reset();
      facebook.pages.set(PAGE_ID, { id: PAGE_ID, name: 'Achados Tech' });

      // Score 90: passa no Telegram (85), reprovado no Facebook (95).
      sequence += 1;
      const product = await isolated.prisma.product.create({
        data: {
          marketplace: 'MERCADO_LIVRE',
          marketplaceItemId: `MLB${310000 + sequence}`,
          title: 'Produto limiar',
          currentPrice: money('700.00'),
          imageUrl: null,
        },
      });
      await isolated.prisma.affiliateLink.create({
        data: { productId: product.id, url: 'https://mercadolivre.com/sec/limiar' },
      });
      await isolated.prisma.opportunityEvaluation.create({
        data: {
          productId: product.id,
          score: 90,
          status: 'APPROVED',
          breakdown: {},
          reasons: [],
          evaluatedAt: clock.now(),
        },
      });
      await isolated.prisma.offer.create({
        data: {
          productId: product.id,
          price: money('700.00'),
          status: 'APPROVED',
          detectedAt: clock.now(),
        },
      });
      await isolated.prisma.channel.create({
        data: { type: 'TELEGRAM', name: 'T', externalIdentifier: '@t' },
      });
      await isolated.prisma.channel.create({
        data: { type: 'FACEBOOK', name: 'F', externalIdentifier: PAGE_ID },
      });

      const summary = await isolated.app.get(AutomationOrchestrator).runDistribution();

      expect(summary.distribution?.published).toBe(1);
      expect(telegram.callsTo('sendMessage')).toHaveLength(1);
      expect(facebook.callsTo('/feed')).toHaveLength(0);
    } finally {
      await isolated.app.close();
      delete process.env.FACEBOOK_MIN_SCORE;
    }
  });

  it('nao publica no Facebook quando so o autopilot dele esta desligado', async () => {
    process.env.FACEBOOK_AUTO_PUBLISH_ENABLED = 'false';
    const isolated = await createTestHarness({ clock });

    try {
      await resetDatabase(isolated.prisma);
      telegram.reset();
      facebook.reset();

      sequence += 1;
      const product = await isolated.prisma.product.create({
        data: {
          marketplace: 'MERCADO_LIVRE',
          marketplaceItemId: `MLB${320000 + sequence}`,
          title: 'Produto',
          currentPrice: money('700.00'),
          imageUrl: null,
        },
      });
      await isolated.prisma.affiliateLink.create({
        data: { productId: product.id, url: 'https://mercadolivre.com/sec/x' },
      });
      await isolated.prisma.opportunityEvaluation.create({
        data: {
          productId: product.id,
          score: 95,
          status: 'APPROVED',
          breakdown: {},
          reasons: [],
          evaluatedAt: clock.now(),
        },
      });
      await isolated.prisma.offer.create({
        data: {
          productId: product.id,
          price: money('700.00'),
          status: 'APPROVED',
          detectedAt: clock.now(),
        },
      });
      await isolated.prisma.channel.create({
        data: { type: 'TELEGRAM', name: 'T', externalIdentifier: '@t' },
      });
      await isolated.prisma.channel.create({
        data: { type: 'FACEBOOK', name: 'F', externalIdentifier: PAGE_ID },
      });

      const summary = await isolated.app.get(AutomationOrchestrator).runDistribution();

      expect(summary.distribution?.published).toBe(1);
      expect(telegram.callsTo('sendMessage')).toHaveLength(1);
      // Nenhuma chamada a Meta: o destino esta desligado.
      expect(facebook.calls).toHaveLength(0);
      expect(await isolated.prisma.publication.count()).toBe(1);
    } finally {
      await isolated.app.close();
      process.env.FACEBOOK_AUTO_PUBLISH_ENABLED = 'true';
    }
  });
});
