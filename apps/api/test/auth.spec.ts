import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestHarness, resetDatabase } from './app-harness';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuthService, hashToken } from '../src/modules/auth/auth.service';
import { PasswordService } from '../src/modules/auth/password.service';
import { LoginThrottleService } from '../src/modules/auth/login-throttle.service';

const EMAIL = 'admin@garimpo.test';
const PASSWORD = 'senha-super-secreta-123';

describe('Autenticacao administrativa', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let auth: AuthService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestHarness());
    passwords = app.get(PasswordService);
    auth = app.get(AuthService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
    // O contador de tentativas vive em memoria e atravessa testes.
    app.get(LoginThrottleService)['attempts'].clear();
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
    await app?.close();
  });

  /** Sessoes apenas do admin deste teste - o harness mantem a propria. */
  const sessionsOf = (adminUserId: string) =>
    prisma.adminSession.findMany({ where: { adminUserId } });

  async function createAdmin(options: { active?: boolean } = {}) {
    return prisma.adminUser.create({
      data: {
        email: EMAIL,
        passwordHash: await passwords.hash(PASSWORD),
        active: options.active ?? true,
      },
    });
  }

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password });

  describe('AdminUser', () => {
    it('nunca persiste a senha em texto puro', async () => {
      const user = await createAdmin();

      expect(user.passwordHash).not.toBe(PASSWORD);
      expect(user.passwordHash).not.toContain(PASSWORD);
      // argon2id, nao um hash simples.
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(await passwords.verify(user.passwordHash, PASSWORD)).toBe(true);
    });

    it('gera hashes diferentes para a mesma senha (salt por usuario)', async () => {
      const first = await passwords.hash(PASSWORD);
      const second = await passwords.hash(PASSWORD);

      expect(first).not.toBe(second);
      expect(await passwords.verify(second, PASSWORD)).toBe(true);
    });

    it('recusa email duplicado', async () => {
      await createAdmin();

      await expect(
        prisma.adminUser.create({
          data: { email: EMAIL, passwordHash: await passwords.hash('outra-senha-123') },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('POST /auth/login', () => {
    it('autentica e devolve sessao sem expor o hash', async () => {
      const user = await createAdmin();

      const response = await login(EMAIL, PASSWORD).expect(200);

      expect(response.body.user).toEqual({ id: user.id, email: EMAIL });
      expect(response.body.token).toEqual(expect.any(String));
      expect(response.body.expiresAt).toEqual(expect.any(String));

      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('$argon2id$');
      expect(serialized).not.toContain(PASSWORD);
    });

    it('define cookie HttpOnly, SameSite e Path', async () => {
      await createAdmin();

      const response = await login(EMAIL, PASSWORD).expect(200);
      const cookie = (response.headers['set-cookie'] as unknown as string[])[0];

      expect(cookie).toContain('garimpo_session=');
      // HttpOnly impede leitura por JavaScript no browser.
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      // Fora de producao nao marcamos Secure, senao o cookie nao funcionaria
      // em http://localhost.
      expect(cookie).not.toContain('Secure');
    });

    it('marca o cookie como Secure em producao', async () => {
      await createAdmin();
      const previous = process.env.APP_ENV;
      process.env.APP_ENV = 'production';

      try {
        const response = await login(EMAIL, PASSWORD).expect(200);
        const cookie = (response.headers['set-cookie'] as unknown as string[])[0];

        expect(cookie).toContain('Secure');
        expect(cookie).toContain('HttpOnly');
      } finally {
        process.env.APP_ENV = previous;
      }
    });

    it('usa a mesma mensagem generica para email inexistente e senha errada', async () => {
      await createAdmin();

      const unknown = await login('ninguem@garimpo.test', PASSWORD).expect(401);
      const wrong = await login(EMAIL, 'senha-errada-123').expect(401);

      expect(unknown.body.message).toBe('Invalid credentials');
      expect(wrong.body.message).toBe('Invalid credentials');
      // Nao revela qual dos dois falhou.
      expect(unknown.body.message).toBe(wrong.body.message);
      expect(JSON.stringify(unknown.body)).not.toMatch(/exist|not found|password/i);
    });

    it('recusa usuario inativo como credencial invalida', async () => {
      await createAdmin({ active: false });

      const response = await login(EMAIL, PASSWORD).expect(401);

      expect(response.body.message).toBe('Invalid credentials');
      const user = await prisma.adminUser.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(await sessionsOf(user.id)).toHaveLength(0);
    });

    it('valida o formato do payload sem detalhar a regra', async () => {
      await request(app.getHttpServer()).post('/auth/login').send({}).expect(400);
      await login('nao-e-email', PASSWORD).expect(400);
    });

    it('registra lastLoginAt', async () => {
      const user = await createAdmin();
      expect(user.lastLoginAt).toBeNull();

      await login(EMAIL, PASSWORD).expect(200);

      const updated = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id } });
      expect(updated.lastLoginAt).not.toBeNull();
    });
  });

  describe('forca bruta', () => {
    it('bloqueia apos 5 tentativas na janela e informa Retry-After', async () => {
      await createAdmin();

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await login(EMAIL, 'senha-errada-123').expect(401);
      }

      const blocked = await login(EMAIL, 'senha-errada-123').expect(429);
      expect(blocked.headers['retry-after']).toBeDefined();

      // Bloqueado tambem com a senha correta: o freio e por tentativas.
      await login(EMAIL, PASSWORD).expect(429);
    });

    it('login bem-sucedido zera o contador', async () => {
      await createAdmin();

      await login(EMAIL, 'senha-errada-123').expect(401);
      await login(EMAIL, 'senha-errada-123').expect(401);
      await login(EMAIL, PASSWORD).expect(200);

      // O contador foi zerado: novas tentativas erradas nao bloqueiam de imediato.
      await login(EMAIL, 'senha-errada-123').expect(401);
      await login(EMAIL, PASSWORD).expect(200);
    });

    it('nao bloqueia a conta permanentemente: a janela expira', () => {
      const throttle = app.get(LoginThrottleService);
      const start = Date.now();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        throttle.registerFailure(EMAIL, '1.2.3.4', start);
      }

      expect(throttle.retryAfterSeconds(EMAIL, '1.2.3.4', start)).toBeGreaterThan(0);
      // Passados 15 minutos, libera sozinho.
      expect(throttle.retryAfterSeconds(EMAIL, '1.2.3.4', start + 15 * 60_000)).toBe(0);
    });
  });

  describe('sessao', () => {
    it('guarda apenas o hash do token, nunca o token bruto', async () => {
      const user = await createAdmin();
      const { body } = await login(EMAIL, PASSWORD).expect(200);

      const sessions = await sessionsOf(user.id);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].tokenHash).not.toBe(body.token);
      expect(sessions[0].tokenHash).toBe(hashToken(body.token));

      // O token bruto nao aparece em nenhuma coluna.
      expect(JSON.stringify(sessions[0])).not.toContain(body.token);
    });

    it('aceita sessao valida e recusa token desconhecido', async () => {
      await createAdmin();
      const { body } = await login(EMAIL, PASSWORD).expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.token}`)
        .expect(200)
        .expect((response) => expect(response.body.email).toBe(EMAIL));

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer token-inventado')
        .expect(401);
    });

    it('recusa sessao expirada e a remove', async () => {
      const user = await createAdmin();
      const { body } = await login(EMAIL, PASSWORD).expect(200);

      await prisma.adminSession.updateMany({
        where: { adminUserId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.token}`)
        .expect(401);

      expect(await prisma.adminSession.count({ where: { adminUserId: user.id } })).toBe(0);
    });

    it('invalida a sessao quando o usuario e desativado', async () => {
      const user = await createAdmin();
      const { body } = await login(EMAIL, PASSWORD).expect(200);

      await prisma.adminUser.update({ where: { id: user.id }, data: { active: false } });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.token}`)
        .expect(401);
    });

    it('mantem sessoes independentes', async () => {
      await createAdmin();
      const first = (await login(EMAIL, PASSWORD).expect(200)).body;
      const second = (await login(EMAIL, PASSWORD).expect(200)).body;

      expect(first.token).not.toBe(second.token);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${first.token}`)
        .expect(204);

      // Encerrar uma sessao nao derruba a outra.
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${first.token}`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${second.token}`)
        .expect(200);
    });

    it('aceita o cookie quando a API e acessada direto pelo browser', async () => {
      await createAdmin();
      const { body } = await login(EMAIL, PASSWORD).expect(200);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `garimpo_session=${body.token}`)
        .expect(200);
    });

    it('respeita o TTL configurado', async () => {
      await createAdmin();
      const before = Date.now();

      const { body } = await login(EMAIL, PASSWORD).expect(200);
      const ttlHours = (new Date(body.expiresAt).getTime() - before) / 3_600_000;

      expect(ttlHours).toBeGreaterThan(11.9);
      expect(ttlHours).toBeLessThanOrEqual(12.1);
    });

    it('remove sessoes expiradas no login', async () => {
      const user = await createAdmin();
      await prisma.adminSession.create({
        data: {
          adminUserId: user.id,
          tokenHash: hashToken('token-velho'),
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      await login(EMAIL, PASSWORD).expect(200);

      // A sessao vencida sumiu; sobrou apenas a nova.
      const sessions = await sessionsOf(user.id);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('POST /auth/logout', () => {
    it('invalida a sessao e limpa o cookie', async () => {
      const user = await createAdmin();
      const { body } = await login(EMAIL, PASSWORD).expect(200);

      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${body.token}`)
        .expect(204);

      const cookie = (response.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toContain('garimpo_session=;');

      expect(await sessionsOf(user.id)).toHaveLength(0);
    });

    it('e idempotente', async () => {
      await createAdmin();
      const { body } = await login(EMAIL, PASSWORD).expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${body.token}`)
        .expect(204);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${body.token}`)
        .expect(204);
      // Sem token nenhum tambem responde 204.
      await request(app.getHttpServer()).post('/auth/logout').expect(204);
    });
  });

  describe('AuthService', () => {
    it('nao lanca ao verificar hash malformado', async () => {
      expect(await passwords.verify('nao-e-um-hash', PASSWORD)).toBe(false);
    });

    it('validate devolve null para token ausente', async () => {
      expect(await auth.validate(undefined)).toBeNull();
      expect(await auth.validate('')).toBeNull();
    });
  });
});
