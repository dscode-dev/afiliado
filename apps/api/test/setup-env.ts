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

// A suite nunca fala com o Telegram real: `TelegramFakeServer` sobrescreve
// TELEGRAM_API_BASE_URL por teste. O token aqui e fabricado de proposito.
process.env.TELEGRAM_BOT_TOKEN = '123456789:TEST-BOT-TOKEN-NAO-REAL';
process.env.TELEGRAM_TIMEOUT_MS = '500';
process.env.TELEGRAM_MAX_RETRY_AFTER_SECONDS = '2';

// Nenhum timer real na suite: os jobs sao exercitados chamando o scheduler
// diretamente. O autopilot fica no default de producao (OFF) - os testes que
// precisam dele ligado sobrescrevem a env antes de criar o app.
process.env.AUTOMATION_SCHEDULER_ENABLED = 'false';
process.env.TELEGRAM_AUTO_PUBLISH_ENABLED = 'false';
process.env.APP_TIMEZONE = 'America/Sao_Paulo';

// A suite nunca fala com a Meta real: `FacebookFakeServer` sobrescreve
// META_API_BASE_URL por teste. O token aqui e fabricado de proposito.
process.env.META_APP_ID = 'test-app-id';
process.env.META_APP_SECRET = 'test-app-secret';
process.env.META_PAGE_ACCESS_TOKEN = 'EAA-TEST-PAGE-TOKEN-NAO-REAL';
process.env.META_TIMEOUT_MS = '500';
process.env.FACEBOOK_AUTO_PUBLISH_ENABLED = 'false';

// O affiliate-bot e sempre falso na suite. Aponta para uma porta morta por
// padrao, para que qualquer teste que esqueca de subir o fake falhe alto.
process.env.AFFILIATE_BOT_URL = 'http://127.0.0.1:1';
process.env.AFFILIATE_BOT_TIMEOUT_MS = '2000';
process.env.AFFILIATE_GENERATION_CONCURRENCY = '3';
process.env.MELI_TOKEN_SECRET = 'segredo-de-teste-para-cifrar-credencial';
