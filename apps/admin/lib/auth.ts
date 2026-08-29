import { redirect } from 'next/navigation';
import { ApiError, getOne } from './api';
import { AdminIdentity, sessionToken } from './session';

/**
 * Identidade da sessao atual, validada pela API.
 *
 * Retorna null quando nao ha sessao ou quando a API a recusa (expirada,
 * revogada, usuario desativado). O painel nao decide isso sozinho.
 */
export async function currentAdmin(): Promise<AdminIdentity | null> {
  if (!(await sessionToken())) return null;

  try {
    // `allow401` evita o redirect automatico: aqui o 401 e uma resposta
    // legitima ("nao ha sessao"), nao um erro a tratar.
    return await getOne<AdminIdentity>('/auth/me', { allow401: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/**
 * Exige sessao. Usado pelas paginas e por toda Server Action que faz operacao
 * administrativa - uma action nao e segura so porque a pagina exige login.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const admin = await currentAdmin();

  // O cookie invalido nao e apagado aqui: cookies so podem ser alterados em
  // Server Action ou Route Handler, nunca durante o render. Ele expira sozinho
  // e o logout o remove explicitamente.
  if (!admin) redirect('/login');

  return admin;
}
