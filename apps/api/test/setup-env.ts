import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';

loadEnv({ path: join(__dirname, '..', '..', '..', '.env'), quiet: true });

// Os testes de integracao rodam contra um banco dedicado, nunca contra o de
// desenvolvimento: eles truncam tabelas entre os casos.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL nao definida. Copie .env.example para .env e suba o PostgreSQL com `npm run db:up`.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.APP_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// A suite nunca fala com o Mercado Livre real: `MeliFakeServer` sobrescreve
// MELI_API_BASE_URL por teste. Credenciais aqui sao fabricadas de proposito.
process.env.MELI_CLIENT_ID = 'test-client-id';
process.env.MELI_CLIENT_SECRET = 'test-client-secret';
process.env.MELI_SITE_ID = 'MLB';
process.env.MELI_TIMEOUT_MS = '500';
process.env.MELI_SYNC_CONCURRENCY = '4';
delete process.env.MELI_REFRESH_TOKEN;
