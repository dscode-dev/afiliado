import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Clock } from '../src/modules/automation/clock';
import { AuthService } from '../src/modules/auth/auth.service';
import { PasswordService } from '../src/modules/auth/password.service';

export interface TestHarness {
  app: INestApplication;
  prisma: PrismaService;
  /** Token de sessao de um admin de teste, ja criado e ativo. */
  token: string;
}

/**
 * Token da sessao criada pelo harness mais recente.
 *
 * A API e "autenticada por padrao", entao as suites de dominio precisam de uma
 * sessao valida. Guardar aqui evita repetir o header em ~160 chamadas.
 */
let currentToken = '';

/**
 * `request()` ja autenticado. As suites de dominio usam este helper; a suite
 * de autenticacao usa `request()` cru justamente para exercitar o 401.
 */
export function authed(app: INestApplication) {
  const server = app.getHttpServer() as Parameters<typeof request>[0];
  const withAuth = (method: 'get' | 'post' | 'patch' | 'put' | 'delete') => (url: string) =>
    request(server)[method](url).set('Authorization', `Bearer ${currentToken}`);

  return {
    get: withAuth('get'),
    post: withAuth('post'),
    patch: withAuth('patch'),
    put: withAuth('put'),
    delete: withAuth('delete'),
  };
}

/**
 * A configuracao do Mercado Livre e lida na construcao do container, entao a
 * base URL do servidor falso precisa estar no ambiente antes de criar o app.
 */
export function useFakeMarketplace(baseUrl: string): void {
  process.env.MELI_API_BASE_URL = baseUrl;
}

/** Mesma razao: a config do Telegram e lida na construcao do container. */
export function useFakeTelegram(baseUrl: string): void {
  process.env.TELEGRAM_API_BASE_URL = baseUrl;
}

/** Idem para a Graph API da Meta. */
export function useFakeFacebook(baseUrl: string): void {
  process.env.META_API_BASE_URL = baseUrl;
}

/** Idem para o affiliate-bot: a suite nunca sobe browser nem usa a conta real. */
export function useFakeAffiliateBot(baseUrl: string): void {
  process.env.AFFILIATE_BOT_URL = baseUrl;
}

/**
 * Sobe a aplicacao real (mesmos pipes, filtros e modulos do servidor HTTP)
 * apontando para o banco de testes.
 */
export async function createTestHarness(options: { clock?: Clock } = {}): Promise<TestHarness> {
  const builder = Test.createTestingModule({ imports: [AppModule] });

  // Relogio controlavel: janela de horario, limites e idade de oferta ficam
  // deterministicos sem depender de timers reais.
  if (options.clock) {
    builder.overrideProvider(Clock).useValue(options.clock);
  }

  const moduleRef = await builder.compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  const prisma = app.get(PrismaService);
  currentToken = await createTestSession(app, prisma);

  return { app, prisma, token: currentToken };
}

/** Cria (ou reaproveita) um admin de teste e abre uma sessao para ele. */
async function createTestSession(app: INestApplication, prisma: PrismaService): Promise<string> {
  const email = 'operador@garimpo.test';
  const existing = await prisma.adminUser.findUnique({ where: { email } });

  if (!existing) {
    const passwords = app.get(PasswordService);
    await prisma.adminUser.create({
      data: { email, passwordHash: await passwords.hash('senha-de-teste-123') },
    });
  }

  const login = await app.get(AuthService).login(email, 'senha-de-teste-123');

  return login.token;
}

/** Ordem respeita as foreign keys; TRUNCATE ... CASCADE mantem o teste isolado. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "publications", "offers", "affiliate_links", "channels", "price_snapshots", "products" RESTART IDENTITY CASCADE',
  );
}
