'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, getOne } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { FormState } from '@/components/form-state';
import { MercadoLivreAuthStatus } from '@/lib/types';

/**
 * O `state` e de uso unico. Quando o navegador CONSEGUE abrir a URI de retorno,
 * o proprio callback ja o consumiu — e colar a URL aqui falha exatamente como
 * falharia um replay malicioso. Sem este aviso a mensagem faz o operador achar
 * que a autorizacao nao funcionou, quando ela funcionou.
 */
async function explain(message: string): Promise<string> {
  try {
    const status = await getOne<MercadoLivreAuthStatus>('/auth/mercado-livre/status');

    if (status.authorized) {
      return `${message} O Mercado Livre ja esta autorizado${
        status.externalUserId ? ` (usuario ${status.externalUserId})` : ''
      }: o proprio redirect concluiu a autorizacao e o codigo desta URL ja tinha sido usado. Nao ha nada a refazer.`;
    }
  } catch {
    // A explicacao e um extra: se o status falhar, a mensagem crua ja serve.
  }

  return message;
}

/**
 * Inicia o Authorization Code.
 *
 * A API guarda o `state` em memoria por 10 minutos, entao a URL devolvida so
 * vale para ESTA instancia da API - e por isso ela e gerada sob demanda, e
 * nunca fica salva em lugar nenhum.
 */
export async function startAuthorization(_state: FormState): Promise<FormState> {
  await requireAdmin();

  try {
    const { authorizationUrl } = await getOne<{ authorizationUrl: string }>(
      '/auth/mercado-livre/authorize',
    );

    // A URL vai na mensagem para a pagina renderizar o link. O `state` dentro
    // dela e de uso unico: expira em 10 minutos ou no primeiro callback.
    return { ok: true, message: authorizationUrl };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'Falha ao iniciar a autorizacao',
    };
  }
}

/**
 * Conclui a autorizacao a partir da URL de retorno colada pelo operador.
 *
 * Existe porque a redirect URI registrada no Mercado Livre pode nao ser
 * alcancavel pelo browser (dominio ainda nao publicado, ou HTTPS exigido pelo
 * painel do ML sobre uma API local em HTTP). Nesses casos o browser mostra
 * erro, mas a barra de endereco ja traz `code` e `state` - e e so isso que
 * precisamos: quem faz a troca por tokens e a API, nao o browser.
 */
export async function completeAuthorization(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const raw = String(formData.get('returnUrl') ?? '').trim();
  if (!raw) return { error: 'Cole a URL de retorno do Mercado Livre.' };

  let code: string | null;
  let state: string | null;
  let denied: string | null;

  try {
    const parsed = new URL(raw);
    code = parsed.searchParams.get('code');
    state = parsed.searchParams.get('state');
    denied = parsed.searchParams.get('error');
  } catch {
    return { error: 'Isso nao parece uma URL. Cole o endereco inteiro da barra do navegador.' };
  }

  if (denied) return { error: 'A autorizacao foi negada no Mercado Livre.' };
  if (!code || !state) {
    return { error: 'A URL nao traz `code` e `state`. Refaca a autorizacao e copie o endereco completo.' };
  }

  // O `code` e credencial de uso unico: vai na querystring da chamada interna
  // e nunca e devolvido para a tela nem escrito em log do painel.
  const query = new URLSearchParams({ code, state });

  try {
    const result = await getOne<{ status: string; message: string; externalUserId?: string | null }>(
      `/auth/mercado-livre/callback?${query.toString()}`,
    );

    if (result.status !== 'ok') return { error: await explain(result.message) };

    revalidatePath('/mercado-livre');
    revalidatePath('/products/discover');

    return {
      ok: true,
      message: `Mercado Livre autorizado${
        result.externalUserId ? ` (usuario ${result.externalUserId})` : ''
      }.`,
    };
  } catch (error) {
    return {
      error: error instanceof ApiError ? error.message : 'Falha ao concluir a autorizacao',
    };
  }
}
