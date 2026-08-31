import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Raiz do repositorio. O bot compila para CommonJS, entao `__dirname` existe
 * tanto no build quanto sob o tsx.
 */
function repoRoot(): string {
  // src/ (ou dist/) -> apps/affiliate-bot -> apps -> raiz
  return resolve(__dirname, '..', '..', '..');
}

/**
 * Perfil padrao do browser.
 *
 * Fica DENTRO do repositorio (e no .gitignore) de proposito: assim o operador
 * roda o login na propria maquina e o container le exatamente o mesmo diretorio
 * por bind mount. Um volume nomeado do Docker seria invisivel para o login.
 */
function defaultProfilePath(): string {
  // Dentro do container o compose monta o perfil aqui.
  if (existsSync('/.dockerenv')) return '/profile';

  return join(repoRoot(), '.garimpo', 'affiliate-profile');
}

/**
 * Configuracao do affiliate-bot.
 *
 * O perfil do browser guarda a sessao autenticada na Central de Afiliados.
 * Ele NUNCA vai para o git, para a imagem Docker ou para backup publico.
 */
export const config = {
  port: Number(process.env.AFFILIATE_BOT_PORT ?? 3400),
  profilePath: process.env.AFFILIATE_BROWSER_PROFILE_PATH || defaultProfilePath(),
  headless: (process.env.AFFILIATE_BOT_HEADLESS ?? 'true').toLowerCase() !== 'false',
  timeoutMs: Number(process.env.AFFILIATE_BOT_TIMEOUT_MS ?? 30000),
  /** Origem da Central de Afiliados; os requests sao same-origin a partir dela. */
  consoleUrl: process.env.AFFILIATE_CONSOLE_URL ?? 'https://www.mercadolivre.com.br/afiliados',
  apiOrigin: process.env.AFFILIATE_API_ORIGIN ?? 'https://www.mercadolivre.com.br',
  /** Segredo compartilhado com a API; o bot nao fica aberto na rede. */
  sharedSecret: process.env.AFFILIATE_BOT_SECRET ?? '',
  /** Verdadeiro quando rodando dentro de um container. */
  inContainer: existsSync('/.dockerenv'),
} as const;
