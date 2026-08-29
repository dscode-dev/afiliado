import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { renderWhatsAppMessage } from '../src/modules/distribution/whatsapp/message.renderer';

const money = (value: string) => new Prisma.Decimal(value);

const renderBase = {
  title: 'Echo Dot 5a geracao',
  price: money('700.00'),
  originalPrice: money('1000.00'),
  discountPercentage: money('30.00'),
  affiliateUrl: 'https://mercadolivre.com/sec/abc',
  highlights: { amongBestSellers: false, nearLowestTrackedPrice: false },
};

describe('renderWhatsAppMessage', () => {
  it('monta a mensagem completa de forma deterministica', () => {
    const text = renderWhatsAppMessage({
      ...renderBase,
      highlights: { amongBestSellers: true, nearLowestTrackedPrice: true },
    });

    expect(text).toBe(
      [
        '🔥 Oferta encontrada',
        '',
        'Echo Dot 5a geracao',
        '',
        'De R$ 1.000,00',
        'por R$ 700,00',
        '',
        '📉 30% de desconto',
        '📊 Proximo do menor preco que acompanhamos',
        '⭐ Entre os mais vendidos da categoria',
        '',
        '👉 Confira no Mercado Livre:',
        'https://mercadolivre.com/sec/abc',
      ].join('\n'),
    );

    expect(
      renderWhatsAppMessage({
        ...renderBase,
        highlights: { amongBestSellers: true, nearLowestTrackedPrice: true },
      }),
    ).toBe(text);
  });

  it('usa "Por" quando nao ha preco original', () => {
    const text = renderWhatsAppMessage({
      ...renderBase,
      originalPrice: null,
      discountPercentage: null,
    });

    expect(text).toContain('Por R$ 700,00');
    expect(text).not.toContain('De R$');
    expect(text).not.toContain('desconto');
  });

  it('nao destaca desconto irrelevante', () => {
    const text = renderWhatsAppMessage({
      ...renderBase,
      originalPrice: money('720.00'),
      discountPercentage: money('2.78'),
    });

    expect(text).not.toContain('desconto');
  });

  it('nao faz afirmacoes que os dados nao sustentam', () => {
    const text = renderWhatsAppMessage(renderBase);

    expect(text).not.toContain('mais vendidos');
    expect(text).not.toContain('menor preco');
    expect(text).not.toMatch(/estoque|restam|ultimas|unidades|corre|imperdivel/i);
  });

  it('nao emite caracteres que o WhatsApp interpreta como formatacao', () => {
    const text = renderWhatsAppMessage({
      ...renderBase,
      title: 'Echo *Dot* _5a_ ~geracao~',
    });

    // O titulo chega literal, e o corpo nao adiciona marcadores proprios.
    expect(text).toContain('Echo *Dot* _5a_ ~geracao~');
    expect(text.replace(/Echo \*Dot\* _5a_ ~geracao~/, '')).not.toMatch(/[*_~]/);
  });

  it('difere do Telegram e do Facebook: superficie propria', () => {
    const text = renderWhatsAppMessage(renderBase);

    expect(text).toContain('👉 Confira no Mercado Livre:');
    expect(text).not.toContain('🛒 Ver no Mercado Livre');
    expect(text).not.toContain('Por: R$');
  });

  it('sempre usa a URL de afiliado', () => {
    const text = renderWhatsAppMessage({
      ...renderBase,
      affiliateUrl: 'https://mercadolivre.com/sec/xyz',
    });

    expect(text).toContain('https://mercadolivre.com/sec/xyz');
    expect(text).not.toContain('produto.mercadolivre.com.br');
  });
});

describe('Distribuicao manual no WhatsApp', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sequence = 0;

  beforeAll(async () => {
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function seed(
    options: {
      withLink?: boolean;
      engineStatus?: 'APPROVED' | 'CANDIDATE';
      operatorDecision?: 'REJECTED' | null;
      channelActive?: boolean;
      channelType?: 'WHATSAPP' | 'TELEGRAM';
      externalIdentifier?: string | null;
    } = {},
  ) {
    sequence += 1;

    const product = await prisma.product.create({
      data: {
        marketplace: 'MERCADO_LIVRE',
        marketplaceItemId: `MLB${200000 + sequence}`,
        title: `Echo Dot ${sequence}`,
        currentPrice: money('700.00'),
        originalPrice: money('1000.00'),
        permalink: 'https://produto.mercadolivre.com.br/MLB-1',
        imageUrl: 'https://http2.mlstatic.com/x.jpg',
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
        breakdown: { popularity: { earned: 20, max: 20 }, priceHistory: { earned: 25, max: 25 } },
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
        type: options.channelType ?? 'WHATSAPP',
        name: `Canal Garimpo ${sequence}`,
        // externalIdentifier e opcional no fluxo manual.
        externalIdentifier:
          options.externalIdentifier === undefined ? null : options.externalIdentifier,
        active: options.channelActive ?? true,
      },
    });

    return { product, offer, channel };
  }

  const preview = (offerId: string, channelId: string) =>
    request(app.getHttpServer()).get(`/offers/${offerId}/manual-preview?channelId=${channelId}`);

  const confirm = (offerId: string, channelId: string) =>
    request(app.getHttpServer()).post(`/offers/${offerId}/manual-publication`).send({ channelId });

  describe('preview', () => {
    it('devolve texto pronto para copiar, sem criar Publication', async () => {
      const { offer, channel } = await seed();

      const response = await preview(offer.id, channel.id).expect(200);

      expect(response.body).toMatchObject({
        provider: 'WHATSAPP',
        channelId: channel.id,
        alreadyPublished: false,
        publishedAt: null,
        price: '700.00',
      });
      expect(response.body.text).toContain('🔥 Oferta encontrada');
      expect(response.body.text).toContain('👉 Confira no Mercado Livre:');
      expect(response.body.affiliateUrl).toContain('https://mercadolivre.com/sec/');

      // Preview e leitura pura.
      expect(await prisma.publication.count()).toBe(0);
    });

    it('funciona com canal sem externalIdentifier', async () => {
      const { offer, channel } = await seed({ externalIdentifier: null });

      await preview(offer.id, channel.id).expect(200);
    });

    it('expoe a imagem para o operador anexar manualmente', async () => {
      const { offer, channel } = await seed();

      const response = await preview(offer.id, channel.id).expect(200);

      expect(response.body.imageUrl).toBe('https://http2.mlstatic.com/x.jpg');
    });

    it('sinaliza quando ja foi publicada', async () => {
      const { offer, channel } = await seed();
      await confirm(offer.id, channel.id).expect(200);

      const response = await preview(offer.id, channel.id).expect(200);

      expect(response.body.alreadyPublished).toBe(true);
      expect(response.body.publishedAt).toEqual(expect.any(String));
    });
  });

  describe('regras de elegibilidade', () => {
    it('recusa sem AffiliateLink ativo', async () => {
      const { offer, channel } = await seed({ withLink: false });

      const response = await preview(offer.id, channel.id).expect(422);

      expect(response.body.message).toContain('link de afiliado');
      await confirm(offer.id, channel.id).expect(422);
      expect(await prisma.publication.count()).toBe(0);
    });

    it('recusa com link existente porem inativo', async () => {
      const { product, offer, channel } = await seed();
      await prisma.affiliateLink.updateMany({
        where: { productId: product.id },
        data: { active: false },
      });

      await preview(offer.id, channel.id).expect(422);
      await confirm(offer.id, channel.id).expect(422);
    });

    it('recusa oportunidade que nao esta APPROVED', async () => {
      const { offer, channel } = await seed({ engineStatus: 'CANDIDATE' });

      const response = await preview(offer.id, channel.id).expect(422);

      expect(response.body.message).toContain('APPROVED');
      await confirm(offer.id, channel.id).expect(422);
    });

    it('respeita a rejeicao humana', async () => {
      const { offer, channel } = await seed({ operatorDecision: 'REJECTED' });

      await preview(offer.id, channel.id).expect(422);
      await confirm(offer.id, channel.id).expect(422);
      expect(await prisma.publication.count()).toBe(0);
    });

    it('recusa canal inativo', async () => {
      const { offer, channel } = await seed({ channelActive: false });

      const response = await preview(offer.id, channel.id).expect(422);

      expect(response.body.message).toContain('inativo');
      await confirm(offer.id, channel.id).expect(422);
    });

    it('recusa marcar manualmente um canal que publica sozinho', async () => {
      const { offer, channel } = await seed({
        channelType: 'TELEGRAM',
        externalIdentifier: '@canal',
      });

      const response = await confirm(offer.id, channel.id).expect(422);

      expect(response.body.message).toContain('automaticamente');
      expect(await prisma.publication.count()).toBe(0);
    });

    it('valida ids e existencia', async () => {
      const { offer, channel } = await seed();

      await request(app.getHttpServer())
        .get(`/offers/${offer.id}/manual-preview?channelId=nao-uuid`)
        .expect(400);
      await request(app.getHttpServer())
        .get(`/offers/${offer.id}/manual-preview`)
        .expect(400);
      await preview(offer.id, '0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c').expect(404);
      await request(app.getHttpServer())
        .get(`/offers/0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c/manual-preview?channelId=${channel.id}`)
        .expect(404);
    });
  });

  describe('confirmacao manual', () => {
    it('registra Publication PUBLISHED sem externalMessageId', async () => {
      const { offer, channel } = await seed();

      const response = await confirm(offer.id, channel.id).expect(200);

      expect(response.body.provider).toBe('WHATSAPP');
      expect(response.body.publication).toMatchObject({
        status: 'PUBLISHED',
        // O WhatsApp nao devolve um id de post acessivel a nos.
        externalMessageId: null,
      });
      expect(response.body.publication.publishedAt).toEqual(expect.any(String));

      const stored = await prisma.publication.findFirstOrThrow({});
      expect(stored.status).toBe('PUBLISHED');
      expect(stored.externalMessageId).toBeNull();
      expect(stored.publishedAt).not.toBeNull();
    });

    it('e idempotente: nao permite marcar duas vezes', async () => {
      const { offer, channel } = await seed();

      await confirm(offer.id, channel.id).expect(200);
      const second = await confirm(offer.id, channel.id).expect(409);

      expect(second.body.message).toContain('ja foi registrada');
      expect(await prisma.publication.count()).toBe(1);
    });

    it('confirmacoes concorrentes registram uma unica publicacao', async () => {
      const { offer, channel } = await seed();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => confirm(offer.id, channel.id)),
      );

      expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await prisma.publication.count()).toBe(1);
    });

    it('permite registrar a mesma oferta em canais WhatsApp diferentes', async () => {
      const { offer, channel } = await seed();
      const other = await prisma.channel.create({
        data: { type: 'WHATSAPP', name: 'Segundo canal', externalIdentifier: null },
      });

      await confirm(offer.id, channel.id).expect(200);
      await confirm(offer.id, other.id).expect(200);

      expect(await prisma.publication.count({ where: { offerId: offer.id } })).toBe(2);
    });

    it('aparece na listagem de publicacoes como WHATSAPP', async () => {
      const { offer, channel } = await seed();
      await confirm(offer.id, channel.id).expect(200);

      const response = await request(app.getHttpServer()).get('/publications').expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.data[0]).toMatchObject({
        status: 'PUBLISHED',
        externalMessageId: null,
        channel: { id: channel.id, type: 'WHATSAPP' },
      });
    });
  });
});
