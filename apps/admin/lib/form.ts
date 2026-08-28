/** Campos vazios do formulario nao devem virar string vazia no payload da API. */
export function optional(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function required(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}
