import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Clock } from '../src/modules/automation/clock';

export interface TestHarness {
  app: INestApplication;
  prisma: PrismaService;
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

  return { app, prisma: app.get(PrismaService) };
}

/** Ordem respeita as foreign keys; TRUNCATE ... CASCADE mantem o teste isolado. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "publications", "offers", "affiliate_links", "channels", "price_snapshots", "products" RESTART IDENTITY CASCADE',
  );
}
