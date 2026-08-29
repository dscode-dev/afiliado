'use server';

import { redirect } from 'next/navigation';
import { post } from '@/lib/api';
import { clearSessionCookie } from '@/lib/session';

/**
 * Encerra a sessao na API e limpa o cookie.
 * Idempotente: falha da API nao impede a limpeza local.
 */
export async function logout(): Promise<void> {
  await post('/auth/logout').catch(() => undefined);
  await clearSessionCookie();

  redirect('/login');
}
