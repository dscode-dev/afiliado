import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { authed, createTestHarness, resetDatabase, useFakeMarketplace, useFakeTelegram } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AutomationOrchestrator } from '../src/modules/automation/automation.orchestrator';
import { AutomationScheduler } from '../src/modules/automation/automation.scheduler';
import { AutomationState } from '../src/modules/automation/automation.state';
import { FixedClock } from '../src/modules/automation/clock';
import { MeliFakeServer } from './meli-fake-server';
import { TelegramFakeServer } from './telegram-fake-server';

const money = (value: string) => new Prisma.Decimal(value);
/** 15:00 em Sao Paulo: dentro da janela padrao (7h-22h). */
const NOON_SP = new Date('2026-06-15T18:00:00Z');
const CATEGORY = 'MLB1051';

describe('Automation loop', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orchestrator: AutomationOrchestrator;
  let scheduler: AutomationScheduler;
  const meli = new MeliFakeServer();
  const telegram = new TelegramFakeServer();
  const clock = new FixedClock(NOON_SP);
  let sequence = 0;

  beforeAll(async () => {
    await meli.start();
    await telegram.start();
    useFakeMarketplace(meli.baseUrl);
    useFakeTelegram(telegram.baseUrl);
    // O autopilot precisa estar ligado ANTES da criacao do container.
    process.env.TELEGRAM_AUTO_PUBLISH_ENABLED = 'true';

    ({ app, prisma } = await createTestHarness({ clock }));
    orchestrator = app.get(AutomationOrchestrator);
    scheduler = app.get(AutomationScheduler);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    meli.reset();
    telegram.reset();
    clock.set(NOON_SP);
    meli.categories.set(CATEGORY, { id: CATEGORY, name: 'Celulares e Telefones' });
  });

  afterAll(async () => {
    await app?.close();
    await meli.stop();
    await telegram.stop();
    process.env.TELEGRAM_AUTO_PUBLISH_ENABLED = 'false';
  });

  /**
   * Produto que realmente atinge score alto no Opportunity Engine.
   *
   * Importante: o ciclo completo REAVALIA os produtos, entao a fixture precisa
   * sustentar o score de verdade - nao basta gravar uma avaliacao pronta.
   */
  async function seedApproved(
    options: { detectedAt?: Date; link?: boolean; price?: string; score?: number } = {},
  ) {
    sequence += 1;
    const now = clock.now();
    const price = options.price ?? '700.00';

    const product = await prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: `MLB${500000 + sequence}`,
        title: `Produto ${sequence}`,
        categoryId: CATEGORY,
        currentPrice: money(price),
        originalPrice: money('1000.00'),
        imageUrl: null,
        // Sinais que sustentam popularity 20, seller 10 e freshness 10.
        highlightPosition: 1,
        highlightCheckedAt: now,
        sellerStatus: 'platinum',
        lastSyncedAt: now,
      },
    });

    // Historico com o preco atual no piso: priceHistory 25.
    await prisma.priceSnapshot.createMany({
      data: [
        {
          productId: product.id,
          price: money('1000.00'),
          capturedAt: new Date(now.getTime() - 5 * 86_400_000),
        },
        { productId: product.id, price: money(price), capturedAt: now },
      ],
    });

    if (options.link !== false) {
      await prisma.affiliateLink.create({
        data: { productId: product.id, url: `https://mercadolivre.com/sec/${sequence}` },
      });
    }

    const offer = await prisma.offer.create({
      data: {
        productId: product.id,
        price: money(price),
        originalPrice: money('1000.00'),
        status: 'APPROVED',
        detectedAt: options.detectedAt ?? now,
      },
    });

    await prisma.opportunityEvaluation.create({
      data: {
        productId: product.id,
        // Nos testes de distribuicao este score e a fonte da verdade; no ciclo
        // completo ele e recalculado pelo engine a partir dos dados acima.
        score: options.score ?? 100,
        status: 'APPROVED',
        breakdown: { popularity: { earned: 20, max: 20 }, priceHistory: { earned: 25, max: 25 } },
        reasons: [],
        evaluatedAt: now,
      },
    });

    return { product, offer };
  }

  async function seedChannel(name = 'Ofertas Brasil', active = true) {
    return prisma.channel.create({
      data: { type: 'TELEGRAM', name, externalIdentifier: `@${name.replace(/\s/g, '_')}`, active },
    });
  }

  describe('execucao manual', () => {
    it('roda o ciclo completo e devolve o resumo', async () => {
      const response = await authed(app).post('/automation/run').expect(200);

      // A geracao de link entra ANTES da avaliacao: sem link, a oportunidade
      // seria NOT_ELIGIBLE e nunca chegaria a distribuicao.
      expect(response.body.phases).toEqual([
        'productRefresh',
        'affiliateLinks',
        'evaluation',
        'distribution',
      ]);
      expect(response.body.productRefresh).not.toBeNull();
      expect(response.body.evaluation).not.toBeNull();
      expect(response.body.distribution).not.toBeNull();
      expect(response.body.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('scheduler e execucao manual chamam o mesmo orchestrator', async () => {
      const spy = jest.spyOn(orchestrator, 'runDistribution');

      await scheduler.runDistributionJob();

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('impede dois ciclos simultaneos', async () => {
      const state = app.get(AutomationState);

      // Simula um ciclo em andamento tomando a trava diretamente - sem deixar
      // promessas penduradas no servidor HTTP.
      const release = state.tryAcquire('productRefresh');
      expect(release).not.toBeNull();

      try {
        const rejected = await authed(app).post('/automation/run').expect(409);

        expect(rejected.body.message).toContain('em execucao');
        expect(state.running).toBe(true);
        expect(state.runningPhase).toBe('productRefresh');
      } finally {
        release?.();
      }

      // Liberada a trava, o ciclo volta a rodar normalmente.
      await authed(app).post('/automation/run').expect(200);
      expect(state.running).toBe(false);
    });

    it('o job agendado ignora o ciclo sobreposto em vez de estourar', async () => {
      const state = app.get(AutomationState);
      const release = state.tryAcquire('distribution');

      try {
        // Nao deve lancar: o scheduler apenas registra e segue.
        await expect(scheduler.runDistributionJob()).resolves.toBeUndefined();
      } finally {
        release?.();
      }
    });
  });

  describe('autopilot desligado', () => {
    it('nao publica nada e reporta as oportunidades como adiadas', async () => {
      // Recria o app com o default de producao (autopilot OFF).
      process.env.TELEGRAM_AUTO_PUBLISH_ENABLED = 'false';
      const off = await createTestHarness({ clock });

      try {
        await resetDatabase(off.prisma);
        await seedApproved();
        await seedChannel();
        telegram.reset();

        const response = await authed(off.app)
          .post('/automation/run')
          .expect(200);

        expect(response.body.distribution.eligible).toBe(1);
        expect(response.body.distribution.published).toBe(0);
        expect(response.body.distribution.deferred).toBe(1);
        expect(response.body.distribution.deferredReason).toBe('autopilot_disabled');

        // Nenhuma chamada ao Telegram e nenhuma Publication criada.
        expect(telegram.calls).toHaveLength(0);
        expect(await off.prisma.publication.count()).toBe(0);
      } finally {
        await off.app.close();
        process.env.TELEGRAM_AUTO_PUBLISH_ENABLED = 'true';
      }
    });
  });

  describe('distribuicao', () => {
    /**
     * Exercita exatamente a fase que o job agendado dispara, sem reavaliar -
     * o que isola a politica de distribuicao do resto do pipeline.
     */
    const distribute = async () => {
      const summary = await orchestrator.runDistribution();
      expect(summary.distribution).not.toBeNull();

      return { ...summary, distribution: summary.distribution as NonNullable<typeof summary.distribution> };
    };

    it('publica a melhor oportunidade respeitando o limite por hora', async () => {
      await seedApproved({ price: '705.00', score: 88 });
      await seedApproved({ price: '700.00', score: 96 });
      await seedApproved({ price: '710.00', score: 91 });
      await seedChannel();

      const response = { body: await distribute() };

      // Limite padrao de 2 por hora.
      expect(response.body.distribution.published).toBe(2);
      expect(response.body.distribution.deferred).toBe(1);
      expect(telegram.callsTo('sendMessage')).toHaveLength(2);

      // Ranking: as duas de maior score foram publicadas.
      const published = await prisma.publication.findMany({
        include: { offer: { include: { product: { include: { evaluation: true } } } } },
      });
      const scores = published
        .map((p) => p.offer.product.evaluation?.score)
        .sort((a, b) => (b ?? 0) - (a ?? 0));
      expect(scores).toEqual([96, 91]);
    });

    it('respeita o limite diario', async () => {
      const channel = await seedChannel();
      await seedApproved();

      // Ja atingiu a cota diaria com publicacoes antigas (fora da janela de 1h).
      const older = await seedApproved();
      for (let index = 0; index < 12; index += 1) {
        const filler = await prisma.offer.create({
          data: {
            productId: older.product.id,
            price: money(`${1000 + index}.00`),
            status: 'APPROVED',
          },
        });
        await prisma.publication.create({
          data: {
            offerId: filler.id,
            channelId: channel.id,
            status: 'PUBLISHED',
            publishedAt: new Date(clock.now().getTime() - 2 * 3_600_000),
          },
        });
      }

      const response = { body: await distribute() };

      expect(response.body.distribution.published).toBe(0);
      expect(response.body.distribution.deferred).toBeGreaterThan(0);
      expect(telegram.callsTo('sendMessage')).toHaveLength(0);
    });

    it('nao publica fora da janela de horario', async () => {
      await seedApproved();
      await seedChannel();
      // 03:00 em Sao Paulo.
      clock.set(new Date('2026-06-15T06:00:00Z'));

      const response = { body: await distribute() };

      expect(response.body.distribution.published).toBe(0);
      expect(response.body.distribution.deferredReason).toBe('outside_publish_window');
      expect(telegram.calls).toHaveLength(0);
    });

    it('nao publica oferta mais velha que o limite de idade', async () => {
      await seedApproved({ detectedAt: new Date(clock.now().getTime() - 48 * 3_600_000) });
      await seedChannel();

      const response = { body: await distribute() };

      expect(response.body.distribution.eligible).toBe(0);
      expect(response.body.distribution.published).toBe(0);
      expect(telegram.calls).toHaveLength(0);
    });

    it('ignora oportunidade abaixo do score minimo', async () => {
      await seedApproved({ score: 84 });
      await seedChannel();

      const response = { body: await distribute() };

      expect(response.body.distribution.eligible).toBe(0);
      expect(telegram.calls).toHaveLength(0);
    });

    it('nao publica sem AffiliateLink ativo', async () => {
      await seedApproved({ link: false });
      await seedChannel();

      const response = { body: await distribute() };

      expect(response.body.distribution.eligible).toBe(0);
      expect(telegram.calls).toHaveLength(0);
    });

    it('respeita a rejeicao humana', async () => {
      const { product } = await seedApproved();
      await prisma.opportunityEvaluation.update({
        where: { productId: product.id },
        data: { operatorDecision: 'REJECTED', operatorDecidedAt: clock.now() },
      });
      await seedChannel();

      const response = { body: await distribute() };

      expect(response.body.distribution.eligible).toBe(0);
      expect(telegram.calls).toHaveLength(0);
    });

    it('ignora canal inativo', async () => {
      await seedApproved();
      await seedChannel('Canal Inativo', false);

      const response = { body: await distribute() };

      expect(response.body.distribution.channels).toHaveLength(0);
      expect(response.body.distribution.published).toBe(0);
    });

    it('aplica limites por canal, publicando a mesma oferta em canais distintos', async () => {
      await seedApproved();
      await seedChannel('Canal Um');
      await seedChannel('Canal Dois');

      const response = { body: await distribute() };

      expect(response.body.distribution.published).toBe(2);
      expect(response.body.distribution.channels).toHaveLength(2);
      expect(await prisma.publication.count()).toBe(2);
    });

    it('nao republica uma oferta ja publicada (idempotencia herdada)', async () => {
      await seedApproved();
      await seedChannel();

      await authed(app).post('/automation/run').expect(200);
      telegram.reset();

      const second = await authed(app).post('/automation/run').expect(200);

      expect(second.body.distribution.published).toBe(0);
      expect(telegram.calls).toHaveLength(0);
      expect(await prisma.publication.count()).toBe(1);
    });

    it('uma falha de publicacao nao impede as demais', async () => {
      await seedApproved({ price: '700.00', score: 96 });
      await seedApproved({ price: '710.00', score: 90 });
      await seedChannel();
      // Falha apenas na primeira publicacao.
      telegram.failOn('sendMessage', {
        status: 400,
        body: { ok: false, description: 'Bad Request: chat not found' },
        remaining: 1,
      });

      const response = { body: await distribute() };

      expect(response.body.distribution.published).toBe(1);
      expect(response.body.distribution.publishFailed).toBe(1);
      expect(response.body.distribution.failures).toHaveLength(1);

      const statuses = (await prisma.publication.findMany()).map((p) => p.status).sort();
      expect(statuses).toEqual(['FAILED', 'PUBLISHED']);
    });
  });

  describe('resiliencia do ciclo', () => {
    it('falha de sincronizacao nao aborta avaliacao nem distribuicao', async () => {
      await seedApproved();
      await seedChannel();
      // Sem credenciais validas o Mercado Livre falha; o ciclo deve continuar.
      meli.failOn('/items', { status: 500 });

      const response = await authed(app).post('/automation/run').expect(200);

      expect(response.body.evaluation).not.toBeNull();
      expect(response.body.distribution).not.toBeNull();
      expect(response.body.distribution.published).toBe(1);
    });

    it('falha na fase inteira e registrada sem derrubar o ciclo', async () => {
      const failing = jest
        .spyOn(prisma.opportunityEvaluation, 'findMany')
        .mockRejectedValue(new Error('falha simulada de leitura'));

      try {
        const response = await authed(app).post('/automation/run').expect(200);

        expect(response.body.phaseFailures).toEqual([
          expect.objectContaining({ phase: 'distribution' }),
        ]);
        expect(response.body.distribution).toBeNull();
        // As fases anteriores continuam reportadas.
        expect(response.body.evaluation).not.toBeNull();
      } finally {
        failing.mockRestore();
      }
    });
  });

  describe('ciclo completo ponta a ponta', () => {
    it('sincroniza, avalia e publica um produto real do Mercado Livre', async () => {
      const itemId = 'MLB1234567890';
      meli.seedSeller('111', '5_green', 'platinum');
      meli.seedItem(
        {
          id: itemId,
          title: 'Echo Dot 5a geracao',
          category_id: CATEGORY,
          seller_id: 111,
          status: 'active',
        },
        { amount: 700, regular: 1000 },
      );
      meli.highlights.set(CATEGORY, [{ id: itemId, position: 1, type: 'ITEM' }]);

      // Importa pelo fluxo real e cadastra o link obrigatorio.
      const imported = await authed(app)
        .post('/products/import')
        .send({ marketplaceItemId: itemId })
        .expect(201);
      const productId = imported.body.product.id;

      await prisma.affiliateLink.create({
        data: { productId, url: 'https://mercadolivre.com/sec/echo' },
      });

      await seedChannel('Canal E2E');
      telegram.reset();

      const summary = await authed(app).post('/automation/run').expect(200);

      // O engine avaliou de verdade e aprovou.
      expect(summary.body.evaluation.approved).toBe(1);
      expect(summary.body.distribution.published).toBe(1);
      expect(summary.body.phaseFailures).toEqual([]);

      const evaluation = await prisma.opportunityEvaluation.findUniqueOrThrow({
        where: { productId },
      });
      expect(evaluation.status).toBe('APPROVED');
      expect(evaluation.score).toBeGreaterThanOrEqual(85);

      // E a publicacao real carrega o link de afiliado, nunca o permalink.
      const publication = await prisma.publication.findFirstOrThrow({});
      expect(publication.status).toBe('PUBLISHED');
      expect(publication.externalMessageId).toEqual(expect.any(String));

      const text = String(telegram.callsTo('sendMessage')[0].body.text);
      expect(text).toContain('https://mercadolivre.com/sec/echo');
      expect(text).not.toContain('produto.mercadolivre.com.br');
    });
  });

  describe('GET /automation/status', () => {
    it('reporta estado, limites e ultima execucao', async () => {
      await authed(app).post('/automation/run').expect(200);

      const response = await authed(app).get('/automation/status').expect(200);

      expect(response.body).toMatchObject({
        autopilotEnabled: true,
        schedulerEnabled: false,
        running: false,
        runningPhase: null,
      });
      // Cada destino aparece com seu proprio estado e limites.
      expect(response.body.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provider: 'TELEGRAM',
            autopilotEnabled: true,
            minScore: 85,
            maxPostsPerHour: 2,
          }),
          expect.objectContaining({
            provider: 'FACEBOOK',
            autopilotEnabled: false,
            maxPostsPerHour: 1,
            maxPostsPerDay: 6,
          }),
        ]),
      );
      expect(response.body.lastRunAt).toEqual(expect.any(String));
      expect(response.body.lastResult.phases).toContain('distribution');
      expect(response.body.limits).toMatchObject({
        maxOfferAgeHours: 24,
        timezone: 'America/Sao_Paulo',
        withinPublishWindow: true,
      });
    });

    it('reporta a janela de horario fechada', async () => {
      clock.set(new Date('2026-06-15T06:00:00Z'));

      const response = await authed(app).get('/automation/status').expect(200);

      expect(response.body.limits.withinPublishWindow).toBe(false);
    });
  });
});
