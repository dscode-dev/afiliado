import { Paginated } from './types';

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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    // Painel administrativo: sempre dados frescos, nunca cache de build.
    cache: 'no-store',
  });

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

export function getOne<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export { BASE_URL };
