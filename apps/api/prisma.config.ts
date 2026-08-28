import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { defineConfig } from 'prisma/config';

// O .env vive na raiz do monorepo e e compartilhado por API e admin.
// A CLI do Prisma roda com cwd em apps/api, entao o caminho e explicito.
loadEnv({ path: join(__dirname, '..', '..', '.env'), quiet: true });

export default defineConfig({
  schema: join('prisma', 'schema.prisma'),
  migrations: {
    path: join('prisma', 'migrations'),
  },
});
