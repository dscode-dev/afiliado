import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma/prisma.service';

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

/**
 * Sobe a aplicacao real (mesmos pipes, filtros e modulos do servidor HTTP)
 * apontando para o banco de testes.
 */
export async function createTestHarness(): Promise<TestHarness> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

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
