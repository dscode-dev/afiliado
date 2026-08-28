/**
 * Validacao das environment variables no boot. A aplicacao falha rapido e com
 * mensagem clara em vez de quebrar na primeira query.
 */
export interface AppEnv {
  APP_ENV: 'development' | 'test' | 'production';
  API_PORT: number;
  DATABASE_URL: string;
  CORS_ORIGINS: string;
  LOG_LEVEL: string;
  MELI_SITE_ID: string;
}

const VALID_APP_ENVS = ['development', 'test', 'production'] as const;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const errors: string[] = [];

  const appEnv = (config.APP_ENV as string) ?? 'development';
  if (!VALID_APP_ENVS.includes(appEnv as (typeof VALID_APP_ENVS)[number])) {
    errors.push(`APP_ENV deve ser um de: ${VALID_APP_ENVS.join(', ')} (recebido: "${appEnv}")`);
  }

  const rawPort = (config.API_PORT as string) ?? '3333';
  const apiPort = Number(rawPort);
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    errors.push(`API_PORT deve ser uma porta valida (recebido: "${rawPort}")`);
  }

  const databaseUrl = config.DATABASE_URL as string;
  if (!databaseUrl) {
    errors.push('DATABASE_URL e obrigatoria');
  } else if (!databaseUrl.startsWith('postgres')) {
    errors.push('DATABASE_URL deve ser uma connection string PostgreSQL');
  }

  // A integracao com o Mercado Livre e opcional no boot: a aplicacao sobe sem
  // credenciais e so falha (502) ao tentar usar os endpoints que dependem dela.
  // Mas configurar pela metade e sempre erro de configuracao.
  const hasClientId = Boolean(config.MELI_CLIENT_ID);
  const hasClientSecret = Boolean(config.MELI_CLIENT_SECRET);

  if (hasClientId !== hasClientSecret) {
    errors.push('MELI_CLIENT_ID e MELI_CLIENT_SECRET devem ser definidos juntos');
  }

  const siteId = (config.MELI_SITE_ID as string) ?? 'MLB';
  if (siteId !== 'MLB') {
    errors.push(`MELI_SITE_ID suportado nesta versao e apenas MLB (recebido: "${siteId}")`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuracao invalida:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    APP_ENV: appEnv as AppEnv['APP_ENV'],
    API_PORT: apiPort,
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: (config.CORS_ORIGINS as string) ?? 'http://localhost:3000',
    LOG_LEVEL: (config.LOG_LEVEL as string) ?? 'log',
    MELI_SITE_ID: siteId,
  };
}

/** `*` libera qualquer origem; caso contrario, lista separada por virgula. */
export function parseCorsOrigins(raw: string): string[] | true {
  const trimmed = raw.trim();
  if (trimmed === '*') return true;

  return trimmed
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
