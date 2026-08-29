import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { parseCorsOrigins } from './config/env.validation';

/**
 * Configuracao HTTP compartilhada entre o servidor real e a suite de testes,
 * garantindo que os testes exercitem exatamente o mesmo pipeline de validacao,
 * seguranca e tratamento de erros.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.use(helmet());
  configureTrustProxy(app);

  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGINS ?? 'http://localhost:3000'),
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    credentials: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Remove campos desconhecidos e rejeita payloads que tentem escrever
      // colunas nao expostas pelo DTO (protecao contra mass assignment).
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  return app;
}

/**
 * Confianca em reverse proxy, sempre explicita.
 *
 * `TRUST_PROXY` aceita `false` (padrao), `true`, um numero de saltos ou uma
 * lista de IPs/sub-redes. Confiar cegamente em `X-Forwarded-For` deixaria
 * qualquer cliente forjar o proprio IP e escapar do limite de tentativas de
 * login - por isso o padrao e nao confiar.
 */
function configureTrustProxy(app: INestApplication): void {
  const raw = (process.env.TRUST_PROXY ?? 'false').trim();

  if (raw === '' || raw.toLowerCase() === 'false') return;

  const express = app.getHttpAdapter().getInstance() as {
    set(setting: string, value: unknown): void;
  };

  const hops = Number(raw);
  express.set('trust proxy', Number.isInteger(hops) ? hops : raw === 'true' ? 1 : raw);
}
