import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authed, createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * A API e "autenticada por padrao": o guard e global e so rotas marcadas com
 * `@Public()` ficam abertas. Estes testes fixam esse contrato.
 */
describe('Guard administrativo', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestHarness());
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app?.close();
  });

  const anonymous = () => request(app.getHttpServer());
  const uuid = '0f1a4b2c-8d3e-4f5a-9b6c-7d8e9f0a1b2c';

  describe('rotas publicas', () => {
    it('/health responde sem sessao', async () => {
      const response = await anonymous().get('/health').expect(200);

      expect(response.body.status).toBe('ok');
    });

    it('/health nao expoe nada sensivel', async () => {
      const response = await anonymous().get('/health').expect(200);
      const serialized = JSON.stringify(response.body);

      expect(Object.keys(response.body).sort()).toEqual([
        'checks',
        'status',
        'timestamp',
        'uptime',
      ]);
      expect(serialized).not.toMatch(/postgres|password|token|secret|DATABASE_URL/i);
      expect(serialized).not.toContain('stack');
    });

    it('/auth/login e /auth/logout sao publicos', async () => {
      // 401 de credencial, nao 401 de guard - a rota foi alcancada.
      await anonymous()
        .post('/auth/login')
        .send({ email: 'x@y.com', password: 'seja-la-o-que-for' })
        .expect(401)
        .expect((response) => expect(response.body.message).toBe('Invalid credentials'));

      await anonymous().post('/auth/logout').expect(204);
    });
  });

  describe('rotas administrativas exigem sessao', () => {
    const protectedRoutes: [string, 'get' | 'post' | 'patch' | 'delete', string][] = [
      ['leitura de produtos', 'get', '/products'],
      ['links de afiliado', 'get', '/affiliate-links'],
      ['canais', 'get', '/channels'],
      ['ofertas', 'get', '/offers'],
      ['oportunidades', 'get', '/opportunities'],
      ['publicacoes', 'get', '/publications'],
      ['analytics', 'get', '/analytics/summary'],
      ['status da automacao', 'get', '/automation/status'],
      ['highlights do marketplace', 'get', '/marketplace/mercado-livre/highlights?categoryId=MLB1051'],
      ['importar produto', 'post', '/products/import'],
      ['sincronizar em lote', 'post', '/products/sync'],
      ['avaliar em lote', 'post', '/products/evaluate'],
      ['quem sou eu', 'get', '/auth/me'],
    ];

    it.each(protectedRoutes)('%s responde 401 sem sessao', async (_label, method, url) => {
      const response = await anonymous()[method](url).expect(401);

      expect(response.body.statusCode).toBe(401);
      // Sem detalhe interno.
      expect(JSON.stringify(response.body)).not.toMatch(/prisma|postgres|argon2/i);
    });

    it('operacoes que disparam publicacao real exigem sessao', async () => {
      // Estas sao as mais perigosas: nao podem ficar anonimas de jeito nenhum.
      await anonymous().post('/automation/run').expect(401);
      await anonymous().post(`/offers/${uuid}/publish`).send({ channelId: uuid }).expect(401);
      await anonymous().post(`/offers/${uuid}/publish-all`).expect(401);
      await anonymous().post(`/publications/${uuid}/retry`).expect(401);
      await anonymous().post(`/offers/${uuid}/manual-publication`).send({ channelId: uuid }).expect(401);
      await anonymous().post(`/channels/${uuid}/test`).expect(401);
    });

    it('token invalido ou expirado tambem e 401', async () => {
      await anonymous().get('/products').set('Authorization', 'Bearer invalido').expect(401);
      await anonymous().get('/products').set('Authorization', 'Bearer ').expect(401);
      await anonymous().get('/products').set('Cookie', 'garimpo_session=invalido').expect(401);
    });
  });

  describe('com sessao valida', () => {
    it('as mesmas rotas funcionam', async () => {
      await authed(app).get('/products').expect(200);
      await authed(app).get('/opportunities').expect(200);
      await authed(app).get('/publications').expect(200);
      await authed(app).get('/analytics/summary').expect(200);
      await authed(app).get('/automation/status').expect(200);
      await authed(app).get('/auth/me').expect(200);
    });
  });
});
