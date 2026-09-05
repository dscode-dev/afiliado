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

/** Diretorio de estado, montado no container pelo compose. */
function stateDir(): string {
  if (existsSync('/.dockerenv')) return '/garimpo';

  return join(repoRoot(), '.garimpo');
}

/**
 * Perfil do browser, usado quando login e bot rodam no MESMO sistema.
 *
 * Fica dentro do repositorio (e no .gitignore) de proposito.
 */
function defaultProfilePath(): string {
  return join(stateDir(), 'affiliate-profile');
}

/**
 * Sessao exportada em JSON portatil (`storageState` do Playwright).
 *
 * Existe porque o PERFIL do Chromium NAO atravessa sistemas operacionais: os
 * cookies sao cifrados com uma chave do SO (DPAPI no Windows, Keychain no
 * macOS, keyring/chave fixa no Linux). Um perfil criado no Windows e aberto
 * pelo Chromium Linux do container aparece com ZERO cookies -- e pior, o
 * Chromium descarta os registros que nao consegue decifrar, corrompendo o
 * perfil original.
 *
 * Verificado: perfil bruto host->container = 0 cookies; este JSON = sessao
 * intacta. Por isso o login exporta, e o container importa.
 */
function defaultSessionStatePath(): string {
  return join(stateDir(), 'affiliate-session.json');
}

/**
 * Perfil do Chrome REAL usado pelo login.
 *
 * Separado do perfil do Playwright de proposito. Ele persiste entre logins
 * para que a Central veja sempre o mesmo dispositivo: um perfil novo a cada
 * tentativa e exatamente o padrao que dispara verificacao extra.
 *
 * Tambem nao pode ser o perfil pessoal do operador -- desde o Chrome 136 a
 * porta de depuracao e ignorada no diretorio de perfil padrao, por seguranca.
 */
function defaultChromeProfilePath(): string {
  return join(stateDir(), 'chrome-login-profile');
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
  /** Sessao portatil entre sistemas; tem precedencia sobre o perfil. */
  sessionStatePath: process.env.AFFILIATE_SESSION_STATE_PATH || defaultSessionStatePath(),
  /** Perfil do Chrome real, usado apenas pelo `affiliate:login`. */
  chromeProfilePath: process.env.AFFILIATE_CHROME_PROFILE_PATH || defaultChromeProfilePath(),
  /** Caminho explicito do Chrome, quando a deteccao automatica nao acha. */
  chromeExecutable: process.env.AFFILIATE_CHROME_PATH || '',
  /** Porta de depuracao usada para LER a sessao do Chrome apos o login. */
  loginDebugPort: Number(process.env.AFFILIATE_LOGIN_DEBUG_PORT ?? 9333),
  headless: (process.env.AFFILIATE_BOT_HEADLESS ?? 'true').toLowerCase() !== 'false',
  timeoutMs: Number(process.env.AFFILIATE_BOT_TIMEOUT_MS ?? 30000),
  /** Origem da Central de Afiliados; os requests sao same-origin a partir dela. */
  consoleUrl: process.env.AFFILIATE_CONSOLE_URL ?? 'https://www.mercadolivre.com.br/afiliados',
  apiOrigin: process.env.AFFILIATE_API_ORIGIN ?? 'https://www.mercadolivre.com.br',
  /** Segredo compartilhado com a API; o bot nao fica aberto na rede. */
  sharedSecret: process.env.AFFILIATE_BOT_SECRET ?? '',
  /**
   * Aceita certificados que o Chromium nao consegue validar.
   *
   * Existe para maquinas com antivirus ou proxy corporativo que interceptam
   * TLS: eles reemitem o certificado com uma CA propria, que esta no trust
   * store do sistema operacional mas nao no do Chromium (que usa NSS e ignora
   * tanto o bundle do sistema quanto NODE_EXTRA_CA_CERTS).
   *
   * Padrao `false`. Ligue APENAS quando o interceptador for conhecido e local.
   */
  ignoreHttpsErrors: (process.env.AFFILIATE_BOT_IGNORE_HTTPS_ERRORS ?? 'false').toLowerCase() === 'true',
  /** Verdadeiro quando rodando dentro de um container. */
  inContainer: existsSync('/.dockerenv'),
} as const;
