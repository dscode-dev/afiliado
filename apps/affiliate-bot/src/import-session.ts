import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config';

/**
 * Importa a sessao a partir de cookies exportados do browser do operador.
 *
 * Ultimo recurso, para quando nem o login com Chrome real passa -- conta ja
 * marcada, IP em quarentena, verificacao em loop. Aqui NENHUM browser e aberto
 * e nenhuma requisicao chega ao Mercado Livre: a pessoa se autentica no
 * navegador que ja usa todo dia, onde a conta ja e conhecida, e so exporta os
 * cookies.
 *
 * Aceita dois formatos, porque as extensoes de exportacao divergem:
 *  - array puro de cookies (Cookie-Editor, EditThisCookie);
 *  - `storageState` do Playwright, quando alguem ja tem um.
 */
async function main(): Promise<void> {
  const input = process.argv[2];

  if (!input) {
    fail([
      'Falta o arquivo de cookies.',
      '',
      '    npm run affiliate:import -- caminho/para/cookies.json',
      '',
      'Como gerar o arquivo:',
      '',
      '  1. No navegador que voce ja usa, entre em mercadolivre.com.br e',
      '     confirme que esta logado na conta com a afiliacao.',
      '  2. Instale uma extensao de exportacao de cookies (Cookie-Editor).',
      '  3. Com a Central de Afiliados aberta, exporte os cookies como JSON.',
      '  4. Salve num arquivo e passe o caminho para este comando.',
      '',
      'O arquivo tem cookies de sessao reais: apague depois de importar.',
    ]);
  }

  const path = resolve(input);
  const raw = readFile(path);
  const cookies = normalize(parse(raw, path));

  if (cookies.length === 0) {
    fail([
      'Nenhum cookie utilizavel no arquivo.',
      `  ${path}`,
      '',
      'Exporte com a Central de Afiliados aberta, e confira que a exportacao',
      'inclui o dominio mercadolivre.com.br.',
    ]);
  }

  const mercadoLivre = cookies.filter((cookie) => cookie.domain.includes('mercadoliv'));

  if (mercadoLivre.length === 0) {
    fail([
      'O arquivo nao tem nenhum cookie de mercadolivre.com.br.',
      '',
      `Dominios encontrados: ${[...new Set(cookies.map((c) => c.domain))].join(', ')}`,
    ]);
  }

  const authenticated = mercadoLivre.some((cookie) =>
    ['orguseridp', 'orgnickp', 'ssid'].includes(cookie.name),
  );

  mkdirSync(dirname(config.sessionStatePath), { recursive: true });
  writeFileSync(
    config.sessionStatePath,
    JSON.stringify({ cookies, origins: [] }, null, 2),
    'utf8',
  );

  try {
    chmodSync(config.sessionStatePath, 0o600);
  } catch {
    // Windows ignora o modo POSIX; a ACL do usuario ja restringe.
  }

  say([
    'Sessao importada.',
    `  arquivo : ${config.sessionStatePath}`,
    `  cookies : ${cookies.length} (${mercadoLivre.length} do Mercado Livre)`,
    '',
  ]);

  if (!authenticated) {
    say([
      'ATENCAO: nenhum cookie de sessao autenticada (orguseridp, orgnickp, ssid)',
      'veio no arquivo. Provavelmente a exportacao foi feita deslogado, ou a',
      'extensao filtrou os cookies httpOnly -- que sao justamente os que',
      'importam. Confira em Automacao de afiliados se o bot ficou READY.',
      '',
    ]);
  }

  say(['Apague o arquivo de origem agora: ele carrega a sua sessao real.', '']);
}

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

function parse(raw: string, path: string): unknown[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    fail([
      'O arquivo nao e um JSON valido.',
      `  ${path}`,
      `  ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  if (Array.isArray(parsed)) return parsed;

  // storageState do Playwright.
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { cookies?: unknown }).cookies)) {
    return (parsed as { cookies: unknown[] }).cookies;
  }

  fail([
    'Formato nao reconhecido.',
    `  ${path}`,
    '',
    'Esperado: um array de cookies, ou um storageState do Playwright.',
  ]);
}

/**
 * Converte para o formato do Playwright.
 *
 * As extensoes usam `expirationDate` em segundos com fracao, e `sameSite` em
 * variantes que o Playwright recusa (`no_restriction`, `unspecified`, `lax`).
 * Cookie de sessao vem sem expiracao e precisa virar -1, nao 0 -- com 0 o
 * Playwright o descarta como ja expirado.
 */
function normalize(entries: unknown[]): StoredCookie[] {
  const cookies: StoredCookie[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    const raw = entry as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name : null;
    const value = typeof raw.value === 'string' ? raw.value : null;
    const domain = typeof raw.domain === 'string' ? raw.domain : null;

    if (!name || value === null || !domain) continue;

    const expiration = raw.expirationDate ?? raw.expires;

    cookies.push({
      name,
      value,
      domain,
      path: typeof raw.path === 'string' ? raw.path : '/',
      expires: typeof expiration === 'number' && expiration > 0 ? Math.floor(expiration) : -1,
      httpOnly: raw.httpOnly === true,
      secure: raw.secure === true,
      sameSite: sameSiteOf(raw.sameSite),
    });
  }

  return cookies;
}

function sameSiteOf(value: unknown): 'Strict' | 'Lax' | 'None' {
  const normalized = String(value ?? '').toLowerCase();

  if (normalized === 'strict') return 'Strict';
  if (normalized === 'none' || normalized === 'no_restriction') return 'None';

  // `unspecified`, `lax` e ausente caem no padrao dos browsers.
  return 'Lax';
}

function readFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    return fail([
      'Nao consegui ler o arquivo.',
      `  ${path}`,
      `  ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
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
    `\nFalha ao importar: ${error instanceof Error ? error.message : String(error)}\n\n`,
  );
  process.exit(1);
});
