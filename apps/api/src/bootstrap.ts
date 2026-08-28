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
