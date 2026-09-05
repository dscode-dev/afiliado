import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Browser, BrowserContext, chromium } from 'playwright';
import { findInstalledBrowser } from './browser-discovery';
import { config } from './config';

/**
 * Autentica UMA vez na Central de Afiliados e exporta a sessao.
 *
 * ESTRATEGIA: o Playwright nao abre mais o browser do login. Quem abre e o
 * Chrome instalado da propria pessoa, iniciado como um atalho comum; o
 * Playwright so se ANEXA depois, pela porta de depuracao, para LER os cookies.
 *
 * Por que a mudanca. Quando o Playwright inicia o browser, ele passa
 * `--enable-automation` (que liga `navigator.webdriver`) e usa uma build de
 * teste do Chromium, sem os componentes proprietarios do Chrome. A Central le
 * esses sinais e trata a sessao como automatizada -- o que acaba em
 * verificacao repetida e, depois de algumas tentativas, bloqueio da conta.
 * Anexar a um Chrome que ja subiu normalmente nao deixa nenhuma dessas marcas.
 *
 * Nada aqui tenta burlar MFA, captcha ou confirmacao de dispositivo: quem
 * autentica e a pessoa. E uma autenticacao eventual de conta que cobre
 * milhares de links, nao uma operacao por produto.
 */

/** Cookies que so existem depois do login. Ver `docs` no README. */
const AUTH_COOKIES = ['orguseridp', 'orgnickp', 'ssid'];

/** Teto de espera pelo login humano. */
const LOGIN_TIMEOUT_MS = 10 * 60_000;

/** Intervalo da checagem LOCAL de cookies. Nao gera trafego para o ML. */
const COOKIE_POLL_MS = 2_000;

async function main(): Promise<void> {
  if (config.inContainer) {
    fail([
      'Este comando abre uma janela de browser e NAO funciona dentro do container.',
      '',
      'Rode na sua maquina, na raiz do projeto:',
      '',
      '    npm run affiliate:login',
      '',
      'O container le a mesma sessao por bind mount.',
    ]);
  }

  const browser = resolveBrowser();

  mkdirSync(config.chromeProfilePath, { recursive: true });

  say([
    `Abrindo ${browser.name} para voce autenticar na Central de Afiliados.`,
    '',
    `  perfil : ${config.chromeProfilePath}`,
    `  sessao : ${config.sessionStatePath}`,
    '',
    'Este e o seu Chrome de verdade, nao o browser de automacao. O perfil e',
    'reaproveitado a cada login, entao a Central passa a reconhecer o mesmo',
    'dispositivo e para de pedir verificacao a toda hora.',
    '',
    '1. Faca login na janela que abriu, inclusive MFA se for pedido.',
    '2. Espere a Central de Afiliados carregar.',
    '3. Deixe a janela aberta: eu aviso aqui quando reconhecer a sessao.',
    '',
  ]);

  const child = launchBrowser(browser.executable);
  let context: BrowserContext | null = null;
  let connection: Browser | null = null;

  try {
    connection = await connectWithRetry();
    context = connection.contexts()[0] ?? (await connection.newContext());

    const tag = await waitForLogin(context);

    await exportSession(context);

    say([
      '',
      'Pronto. Sessao salva e validada.',
      tag ? `Tag ativa: ${tag}` : 'Sessao reconhecida (tag ativa nao identificada).',
      '',
      'Pode fechar a janela do browser. O affiliate-bot detecta o arquivo novo',
      'sozinho, sem precisar reiniciar o container.',
      '',
    ]);
  } finally {
    // Desanexa sem matar o browser: a janela e da pessoa, nao nossa.
    await connection?.close().catch(() => undefined);
    child.unref();
  }
}

function resolveBrowser(): { name: string; executable: string } {
  if (config.chromeExecutable) {
    return { name: 'Chrome', executable: config.chromeExecutable };
  }

  const found = findInstalledBrowser();
  if (found) return found;

  fail([
    'Nao encontrei Chrome nem Edge instalado nesta maquina.',
    '',
    'Instale o Google Chrome, ou aponte o caminho explicitamente:',
    '',
    '    AFFILIATE_CHROME_PATH="C:\\caminho\\para\\chrome.exe" npm run affiliate:login',
    '',
    'O Chromium do Playwright NAO serve aqui: e justamente ele que a Central',
    'identifica como automatizado.',
  ]);
}

/**
 * Sobe o browser como um processo comum.
 *
 * A unica flag fora do padrao e a porta de depuracao, que nao muda o
 * fingerprint da pagina -- diferente de `--enable-automation`, que o Playwright
 * acrescentaria se fosse ele a iniciar o processo.
 */
function launchBrowser(executable: string) {
  const child = spawn(
    executable,
    [
      `--remote-debugging-port=${config.loginDebugPort}`,
      `--user-data-dir=${config.chromeProfilePath}`,
      '--no-first-run',
      '--no-default-browser-check',
      config.consoleUrl,
    ],
    { detached: true, stdio: 'ignore' },
  );

  child.on('error', (error) => {
    fail(['Nao consegui abrir o browser.', `  ${error.message}`]);
  });

  return child;
}

/** O Chrome leva um instante para abrir a porta de depuracao. */
async function connectWithRetry(): Promise<Browser> {
  const endpoint = `http://127.0.0.1:${config.loginDebugPort}`;
  const deadline = Date.now() + 30_000;

  for (;;) {
    try {
      return await chromium.connectOverCDP(endpoint);
    } catch (error) {
      if (Date.now() > deadline) {
        fail([
          'O browser abriu, mas nao consegui me conectar a ele.',
          `  endpoint: ${endpoint}`,
          `  causa   : ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
          '',
          'Se a porta estiver ocupada, escolha outra:',
          '',
          '    AFFILIATE_LOGIN_DEBUG_PORT=9444 npm run affiliate:login',
        ]);
      }
      await sleep(500);
    }
  }
}

/**
 * Espera a autenticacao observando os COOKIES, nao a API.
 *
 * A versao anterior consultava o endpoint de tags a cada 4 segundos enquanto a
 * janela estivesse aberta -- e continuava consultando mesmo depois de
 * reconhecer a sessao. Isso sozinho ja rendia centenas de requisicoes por
 * login. Ler cookies e local: custo zero para a Central.
 *
 * A confirmacao na API acontece UMA vez, quando os cookies de sessao aparecem.
 */
async function waitForLogin(context: BrowserContext): Promise<string | null> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let announced = false;

  for (;;) {
    const cookies = await context.cookies().catch(() => []);
    const authenticated = cookies.some(
      (cookie) => AUTH_COOKIES.includes(cookie.name) && cookie.domain.includes('mercadoliv'),
    );

    if (authenticated) {
      say(['Sessao detectada. Confirmando na Central...']);
      return await confirmTag(context);
    }

    if (!announced && cookies.length > 0) {
      announced = true;
      say(['Aguardando o login... (a janela do browser precisa continuar aberta)']);
    }

    if (Date.now() > deadline) {
      fail([
        'Passaram 10 minutos e o login nao foi concluido.',
        '',
        'Se voce JA esta logado e mesmo assim chegou aqui, os nomes dos cookies',
        'de sessao do Mercado Livre podem ter mudado. Nesse caso use o import',
        'manual, que nao depende de detectar nada:',
        '',
        '    npm run affiliate:import -- caminho/para/cookies.json',
      ]);
    }

    await sleep(COOKIE_POLL_MS);
  }
}

/** Uma unica chamada a Central, so para descobrir a tag ativa. */
async function confirmTag(context: BrowserContext): Promise<string | null> {
  const page = context.pages().find((p) => p.url().includes('mercadoliv')) ?? context.pages()[0];
  if (!page) return null;

  return page
    .evaluate(async () => {
      const response = await fetch('/affiliate-program/api/v2/stripe/user/tags', {
        credentials: 'include',
      });
      if (!response.ok) return null;

      const body = (await response.json().catch(() => null)) as {
        tags?: { tag?: string; in_use?: boolean; status?: string }[];
      } | null;

      const tags = body?.tags ?? [];
      const active = tags.find((t) => t.in_use === true || t.status === 'in_use') ?? tags[0];

      return active?.tag ?? null;
    })
    .catch(() => null);
}

async function exportSession(context: BrowserContext): Promise<void> {
  mkdirSync(dirname(config.sessionStatePath), { recursive: true });
  await context.storageState({ path: config.sessionStatePath });

  // Contem cookies de sessao em texto claro: so o dono le.
  try {
    chmodSync(config.sessionStatePath, 0o600);
  } catch {
    // Windows ignora o modo POSIX; a ACL do usuario ja restringe.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function say(lines: string[]): void {
  process.stdout.write(lines.join('\n') + '\n');
}

function fail(lines: string[]): never {
  process.stderr.write('\n' + lines.join('\n') + '\n\n');
  process.exit(1);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `\nFalha no login: ${error instanceof Error ? error.message : String(error)}\n\n`,
  );
  process.exit(1);
});
