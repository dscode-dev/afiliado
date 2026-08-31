import { cookies } from 'next/headers';

/**
 * Sessao do painel.
 *
 * A fonte da verdade e a API: o cookie guarda apenas o token opaco emitido por
 * ela. O painel nao valida nada sozinho - encaminha o token e deixa a API
 * decidir. Assim nao existem duas sessoes para sair de sincronia.
 */
export const SESSION_COOKIE = 'garimpo_session';

export interface AdminIdentity {
  id: string;
  email: string;
}

/** Token da sessao atual, lido do cookie HttpOnly. */
export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**
 * O cookie deve ou nao exigir HTTPS.
 *
 * Amarrar isso a `NODE_ENV` quebra o acesso pela rede local: a imagem roda com
 * `NODE_ENV=production`, o cookie sai como `Secure`, e o browser recusa
 * grava-lo em `http://192.168.x.x` -- so `localhost` conta como origem segura
 * sem TLS. O login "funciona" e volta para a tela de login, sem erro visivel.
 *
 * Por isso a decisao e explicita: `SESSION_COOKIE_SECURE=false` para servir por
 * HTTP na rede interna, mantendo `true` (o padrao em producao) atras de HTTPS.
 */
function cookieSecure(): boolean {
  const declared = process.env.SESSION_COOKIE_SECURE;
  if (declared !== undefined) return declared.toLowerCase() !== 'false';
  return process.env.NODE_ENV === 'production';
}

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
