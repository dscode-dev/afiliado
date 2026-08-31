const cookieSet = jest.fn();
jest.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));

import { setSessionCookie } from '../lib/session';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Dirent, readdirSync } from 'node:fs';

const admin = join(__dirname, '..');
const read = (relative: string) => readFileSync(join(admin, relative), 'utf8');

/** Todos os `actions.ts` das rotas autenticadas. */
function actionFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true }) as Dirent[]) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) actionFiles(full, found);
    else if (entry.name === 'actions.ts') found.push(full);
  }

  return found;
}

describe('Autenticacao do painel', () => {
  it('separa o layout autenticado do login', () => {
    const root = read('app/layout.tsx');
    const authenticated = read('app/(app)/layout.tsx');

    // O layout raiz nao exige sessao, senao /login nao carregaria.
    expect(root).not.toContain('requireAdmin');
    // O layout das rotas administrativas exige.
    expect(authenticated).toContain('await requireAdmin()');
  });

  it('a tela de login usa a logo do Garimpo sem distorcer', () => {
    const page = read('app/login/page.tsx');
    const css = read('app/globals.css');

    expect(page).toContain('src="/assets/logo.png"');
    expect(css).toMatch(/\.login-logo\s*{[^}]*height:\s*auto/s);
    expect(css).not.toMatch(/\.login-logo\s*{[^}]*height:\s*\d+px/s);
  });

  it('a tela de login nao oferece cadastro nem recuperacao de senha', () => {
    const page = read('app/login/page.tsx') + read('app/login/login-form.tsx');

    expect(page).not.toMatch(/cadastr|sign ?up|criar conta|esqueci|recuperar/i);
    expect(page).toContain('name="email"');
    expect(page).toContain('name="password"');
  });

  it('o login devolve mensagem generica, sem revelar o motivo', () => {
    const actions = read('app/login/actions.ts');

    expect(actions).toContain('Credenciais invalidas.');
    expect(actions).not.toMatch(/email nao existe|senha incorreta|usuario nao encontrado/i);
  });

  it('o cookie de sessao e HttpOnly e inacessivel ao JavaScript', () => {
    const session = read('lib/session.ts');

    expect(session).toContain('httpOnly: true');
    expect(session).toContain("sameSite: 'lax'");
    expect(session).toContain("path: '/'");
    // O valor de `secure` tem teste de comportamento proprio, mais abaixo:
    // afirmar o texto-fonte aqui quebraria a cada refatoracao da expressao.
    // Nada de armazenamento acessivel ao browser.
    expect(session).not.toMatch(/localStorage|sessionStorage/);
  });

  it('nenhum arquivo do painel usa localStorage ou sessionStorage para sessao', () => {
    for (const file of [...actionFiles(join(admin, 'app')), join(admin, 'lib', 'api.ts')]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/localStorage|sessionStorage/);
    }
  });

  it('toda Server Action administrativa valida a sessao', () => {
    const files = actionFiles(join(admin, 'app', '(app)'));

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const exported = source.match(/export async function (\w+)/g) ?? [];

      // Uma action nao e segura so porque a pagina exige login.
      expect(source).toContain('requireAdmin');
      expect(source.split('await requireAdmin()').length - 1).toBe(exported.length);
    }
  });

  it('a sessao e validada pela API, sem sessao paralela no painel', () => {
    const auth = read('lib/auth.ts');

    // Fonte unica da verdade: o painel pergunta a API quem esta autenticado,
    // em vez de manter uma sessao propria.
    expect(auth).toMatch(/getOne<AdminIdentity>\('\/auth\/me'/);
    expect(auth).toContain("redirect('/login')");
    // Sem validacao local de token: nada de decodificar ou conferir assinatura.
    expect(auth).not.toMatch(/jwt|verify\(|decode\(/i);
  });

  it('o token vai para a API como Bearer, sem cookie ambiente', () => {
    const api = read('lib/api.ts');

    expect(api).toContain('Authorization: `Bearer ${token}`');
    // `skipAuth` existe so para o proprio login.
    expect(api).toContain('skipAuth');
  });
});

/**
 * `secure` decide se o painel e utilizavel pela rede local.
 *
 * O browser descarta cookie `Secure` em origem sem TLS que nao seja
 * `localhost`, e o descarte e silencioso: o login redireciona para o dashboard
 * e a navegacao seguinte volta para o login, sem erro nenhum.
 *
 * Testado pelo comportamento, e nao pelo texto-fonte, para sobreviver a
 * refatoracoes da expressao.
 */
describe('Secure do cookie de sessao', () => {
  // [SESSION_COOKIE_SECURE, NODE_ENV, secure esperado]
  const cases: Array<[string | undefined, string, boolean]> = [
    [undefined, 'production', true],
    [undefined, 'development', false],
    ['false', 'production', false], // rede local por HTTP
    ['true', 'development', true],
  ];

  it.each(cases)(
    'SESSION_COOKIE_SECURE=%s + NODE_ENV=%s -> secure=%s',
    async (flag, nodeEnv, expected) => {
      const previousFlag = process.env.SESSION_COOKIE_SECURE;
      const previousNode = process.env.NODE_ENV;

      if (flag === undefined) delete process.env.SESSION_COOKIE_SECURE;
      else process.env.SESSION_COOKIE_SECURE = flag;
      Object.defineProperty(process.env, 'NODE_ENV', { value: nodeEnv, configurable: true });
      cookieSet.mockClear();

      try {
        await setSessionCookie('token-de-teste', new Date(Date.now() + 3_600_000).toISOString());

        expect(cookieSet).toHaveBeenCalledTimes(1);
        expect(cookieSet.mock.calls[0][2]).toMatchObject({ secure: expected, httpOnly: true });
      } finally {
        if (previousFlag === undefined) delete process.env.SESSION_COOKIE_SECURE;
        else process.env.SESSION_COOKIE_SECURE = previousFlag;
        Object.defineProperty(process.env, 'NODE_ENV', {
          value: previousNode,
          configurable: true,
        });
      }
    },
  );
});
