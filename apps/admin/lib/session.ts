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

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Em producao o painel roda atras de HTTPS; em dev, http://localhost.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
