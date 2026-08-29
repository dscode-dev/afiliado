import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Configuracao do affiliate-bot.
 *
 * O perfil do browser guarda a sessao autenticada na Central de Afiliados.
 * Ele NUNCA vai para o git, para a imagem Docker ou para backup publico.
 */
export const config = {
  port: Number(process.env.AFFILIATE_BOT_PORT ?? 3400),
  profilePath:
    process.env.AFFILIATE_BROWSER_PROFILE_PATH ?? join(homedir(), '.garimpo', 'affiliate-profile'),
  headless: (process.env.AFFILIATE_BOT_HEADLESS ?? 'true').toLowerCase() !== 'false',
  timeoutMs: Number(process.env.AFFILIATE_BOT_TIMEOUT_MS ?? 30000),
  /** Origem da Central de Afiliados; os requests sao same-origin a partir dela. */
  consoleUrl: process.env.AFFILIATE_CONSOLE_URL ?? 'https://www.mercadolivre.com.br/afiliados',
  apiOrigin: process.env.AFFILIATE_API_ORIGIN ?? 'https://www.mercadolivre.com.br',
  /** Segredo compartilhado com a API; o bot nao fica aberto na rede. */
  sharedSecret: process.env.AFFILIATE_BOT_SECRET ?? '',
} as const;
