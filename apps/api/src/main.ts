import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { StructuredLogger } from './common/logger/structured-logger.service';

async function bootstrap(): Promise<void> {
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
