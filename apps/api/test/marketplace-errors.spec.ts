import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestHarness, resetDatabase, useFakeMarketplace } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MercadoLivreConfig } from '../src/modules/marketplace/mercado-livre/mercado-livre.config';
import { MeliFakeServer } from './meli-fake-server';

const ITEM_ID = 'MLB1234567890';

describe('Erros da integracao Mercado Livre', () => {
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
    meli.seedItem({ id: ITEM_ID, title: 'Produto' }, { amount: 100 });
  });

  afterAll(async () => {
    await app?.close();
    await meli.stop();
  });

  const importItem = (id = ITEM_ID) =>
    request(app.getHttpServer()).post('/products/import').send({ marketplaceItemId: id });

  it('traduz item inexistente em 404', async () => {
    const response = await importItem('MLB9999999999').expect(404);

    expect(response.body).toMatchObject({ statusCode: 404, error: 'Not Found' });
    expect(response.body.message).toBe('Recurso nao encontrado no Mercado Livre');
  });

  it('traduz 401 do provider em 502', async () => {
    meli.failOn(`/items/${ITEM_ID}`, { status: 401 });

    const response = await importItem().expect(502);
    expect(response.body.message).toBe('Credenciais do Mercado Livre invalidas ou ausentes');
  });

  it('traduz 403 (PolicyAgent) em 502, como falta de credencial', async () => {
    meli.failOn(`/items/${ITEM_ID}`, {
      status: 403,
      body: { code: 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES', status: 403 },
    });

    await importItem().expect(502);
  });

  it('traduz falha de autenticacao no /oauth/token em 502', async () => {
    meli.failTokenWith(400);

    const response = await importItem().expect(502);
    expect(response.body.error).toBe('Bad Gateway');
  });

  it('traduz timeout em 504', async () => {
    meli.failOn(`/items/${ITEM_ID}`, { status: 200, delayMs: 1500 });

    const response = await importItem().expect(504);
    expect(response.body.message).toBe('O Mercado Livre nao respondeu dentro do tempo limite');
  });

  it('traduz rate limit em 429', async () => {
    meli.failOn(`/items/${ITEM_ID}`, { status: 429 });

    await importItem().expect(429);
  });

  it('traduz indisponibilidade em 503', async () => {
    meli.failOn(`/items/${ITEM_ID}`, { status: 500 });

    await importItem().expect(503);
  });

  it('nunca vaza o corpo bruto do provider na resposta', async () => {
    meli.failOn(`/items/${ITEM_ID}`, {
      status: 500,
      body: { secretDiagnostic: 'stack interna do Mercado Livre', internal_id: 'abc123' },
    });

    const response = await importItem().expect(503);
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain('secretDiagnostic');
    expect(serialized).not.toContain('abc123');
  });

  it('repete uma unica vez falhas transitorias e entao desiste', async () => {
    meli.failOn(`/items/${ITEM_ID}`, { status: 500 });

    await importItem().expect(503);

    // Uma tentativa original + uma retentativa.
    expect(meli.countRequests(`/items/${ITEM_ID}`)).toBe(2);
  });

  it('nao repete falhas definitivas', async () => {
    await importItem('MLB9999999999').expect(404);

    expect(meli.countRequests('/items/MLB9999999999')).toBe(1);
  });

  it('reaproveita o token entre chamadas em vez de renovar a cada request', async () => {
    meli.seedItem({ id: 'MLB1111111111', title: 'Outro' }, { amount: 10 });
    const before = meli.tokenRequests;

    await importItem().expect(201);
    await importItem('MLB1111111111').expect(201);

    // Duas importacoes (quatro chamadas externas) custam no maximo uma renovacao.
    expect(meli.tokenRequests - before).toBeLessThanOrEqual(1);
  });

  it('renova o token quando o provider responde 401', async () => {
    await importItem().expect(201);
    const before = meli.tokenRequests;

    // Um unico 401 invalida o cache; a proxima chamada precisa pedir token novo.
    meli.failOn(`/items/${ITEM_ID}`, { status: 401, remaining: 1 });
    await importItem().expect(502);

    await importItem().expect(201);

    expect(meli.tokenRequests - before).toBe(1);
  });
});

describe('MercadoLivreConfig', () => {
  it('nao expoe secrets ao ser serializada', () => {
    const config = new MercadoLivreConfig({
      MELI_CLIENT_ID: 'client-123',
      MELI_CLIENT_SECRET: 'super-secreto',
      MELI_REFRESH_TOKEN: 'refresh-secreto',
    } as NodeJS.ProcessEnv);

    const serialized = JSON.stringify(config);

    expect(serialized).not.toContain('super-secreto');
    expect(serialized).not.toContain('refresh-secreto');
    expect(serialized).toContain('[redacted]');
  });

  it('escolhe o grant conforme a presenca de refresh token', () => {
    const appOnly = new MercadoLivreConfig({
      MELI_CLIENT_ID: 'a',
      MELI_CLIENT_SECRET: 'b',
    } as NodeJS.ProcessEnv);
    const withUser = new MercadoLivreConfig({
      MELI_CLIENT_ID: 'a',
      MELI_CLIENT_SECRET: 'b',
      MELI_REFRESH_TOKEN: 'c',
    } as NodeJS.ProcessEnv);

    expect(appOnly.grant).toBe('client_credentials');
    expect(withUser.grant).toBe('refresh_token');
    expect(withUser.tokenRequestBody().get('refresh_token')).toBe('c');
  });

  it('nao se considera configurada sem client id e secret', () => {
    expect(new MercadoLivreConfig({} as NodeJS.ProcessEnv).isConfigured).toBe(false);
    expect(
      new MercadoLivreConfig({ MELI_CLIENT_ID: 'a' } as NodeJS.ProcessEnv).isConfigured,
    ).toBe(false);
  });
});
