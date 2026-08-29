import { NestFactory } from '@nestjs/core';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { StructuredLogger } from './common/logger/structured-logger.service';

/**
 * Carrega o `.env` ANTES de construir o container.
 *
 * Varias configuracoes (Telegram, Meta, affiliate-bot, autopilot) sao
 * providers `useFactory` que leem `process.env` no momento da construcao -
 * antes de o ConfigModule terminar de ler o arquivo. Sem isto, rodar o build
 * local apenas com `.env` deixaria as integracoes silenciosamente
 * desconfiguradas. Variaveis ja presentes no ambiente (Docker) tem
 * precedencia: `dotenv` nao sobrescreve.
 */
function loadEnvironment(): void {
  for (const candidate of ['.env', join('..', '..', '.env')]) {
    loadEnv({ path: candidate, quiet: true });
  }
}

async function bootstrap(): Promise<void> {
  loadEnvironment();

  const logger = new StructuredLogger();

  const app = await NestFactory.create(AppModule, {
    logger,
    bufferLogs: false,
  });

  configureApp(app);
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3333);
  await app.listen(port);

  logger.log(`API disponivel em http://localhost:${port} (APP_ENV=${process.env.APP_ENV})`, 'Bootstrap');
}

void bootstrap();
