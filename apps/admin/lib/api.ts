import { Paginated } from './types';
import { redirect } from 'next/navigation';
import { sessionToken } from './session';

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3333';

/** Erro vindo da API interna, ja com a mensagem legivel extraida do corpo. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiErrorBody {
  message?: string | string[];
  error?: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (Array.isArray(body.message)) return body.message.join('; ');
    if (body.message) return body.message;
    if (body.error) return body.error;
  } catch {
    // corpo nao-JSON: cai no texto padrao abaixo
  }

  return `A API respondeu ${response.status}`;
}

/**
 * Chamada a API interna.
 *
 * O token da sessao vai como `Authorization: Bearer`. A API nunca depende de
 * cookie ambiente, entao nao ha superficie de CSRF do lado dela.
 * `skipAuth` existe apenas para o proprio login, que ainda nao tem sessao.
 */
interface RequestOptions extends RequestInit {
  /** Chamada sem sessao. Usado apenas pelo proprio login. */
  skipAuth?: boolean;
  /** Devolve o 401 ao chamador em vez de redirecionar (usado por `/auth/me`). */
  allow401?: boolean;
}

async function requestJson<T>(path: string, init?: RequestOptions): Promise<T> {
  const token = init?.skipAuth ? undefined : await sessionToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    // Painel administrativo: sempre dados frescos, nunca cache de build.
    cache: 'no-store',
  });

  // Sessao ausente, expirada ou revogada: o painel volta para o login.
  // Centralizado aqui porque layout e pagina renderizam em paralelo - o
  // redirect do layout sozinho nao impediria a pagina de estourar antes.
  if (response.status === 401 && !init?.skipAuth && !init?.allow401) {
    redirect('/login');
  }

  if (!response.ok) {
    throw new ApiError(await readError(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getList<T>(path: string): Promise<Paginated<T>> {
  return requestJson<Paginated<T>>(path);
}

export function getOne<T>(path: string, options?: { allow401?: boolean }): Promise<T> {
  return requestJson<T>(path, options);
}

export function post<T>(path: string, body?: unknown, options?: { skipAuth?: boolean }): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(options?.skipAuth ? { skipAuth: true } : {}),
  });
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function del<T>(path: string): Promise<T> {
  return requestJson<T>(path, { method: 'DELETE' });
}

export { BASE_URL };
