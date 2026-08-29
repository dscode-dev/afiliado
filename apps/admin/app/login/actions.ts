'use server';

import { redirect } from 'next/navigation';
import { ApiError, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { required } from '@/lib/form';
import { setSessionCookie } from '@/lib/session';
import { AdminIdentity } from '@/lib/session';

interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AdminIdentity;
}

/**
 * Autentica contra a API e guarda o token em cookie HttpOnly.
 *
 * O token nunca chega ao JavaScript do browser: a Server Action roda no
 * servidor e o cookie e HttpOnly.
 */
export async function login(_state: FormState, formData: FormData): Promise<FormState> {
  const email = required(formData, 'email');
  const password = required(formData, 'password');

  let result: LoginResponse;
  try {
    result = await post<LoginResponse>('/auth/login', { email, password }, { skipAuth: true });
  } catch (error) {
    // Mensagem generica: nunca dizemos se o email existe.
    if (error instanceof ApiError) {
      return {
        error:
          error.status === 429
            ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
            : 'Credenciais invalidas.',
      };
    }

    return { error: 'Nao foi possivel entrar. Tente novamente.' };
  }

  await setSessionCookie(result.token, result.expiresAt);

  redirect('/dashboard');
}
