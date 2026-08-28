// Aplica as migrations no banco de testes antes da suite rodar.
// Existe como script para nao depender da sintaxe de env inline do shell.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '..', '..', '..', '.env'), quiet: true });

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  console.error(
    'TEST_DATABASE_URL nao definida. Copie .env.example para .env e suba o PostgreSQL com `npm run db:up`.',
  );
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: join(here, '..'),
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
});

process.exit(result.status ?? 1);
