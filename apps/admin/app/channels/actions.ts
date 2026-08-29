'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, patch, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { optional, required } from '@/lib/form';
import { Channel, ChannelTestResult } from '@/lib/types';

export async function createChannel(_state: FormState, formData: FormData): Promise<FormState> {
  const rawConfiguration = optional(formData, 'configuration');
  let configuration: unknown;

  if (rawConfiguration !== undefined) {
    try {
      configuration = JSON.parse(rawConfiguration);
    } catch {
      return { error: 'configuration precisa ser um JSON valido (ex.: {"language":"pt-BR"})' };
    }
  }

  try {
    await post<Channel>('/channels', {
      type: required(formData, 'type'),
      name: required(formData, 'name'),
      externalIdentifier: optional(formData, 'externalIdentifier'),
      ...(configuration === undefined ? {} : { configuration }),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao criar o canal' };
  }

  revalidatePath('/channels');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setChannelActive(formData: FormData): Promise<void> {
  const id = required(formData, 'id');
  const active = formData.get('active') === 'true';

  await patch<Channel>(`/channels/${id}`, { active });

  revalidatePath('/channels');
  revalidatePath('/dashboard');
}

/**
 * Valida o canal contra a Bot API sem publicar nada (getChat).
 * Confirma que o bot enxerga o canal antes de o operador tentar publicar.
 */
export async function testChannel(_state: FormState, formData: FormData): Promise<FormState> {
  const id = required(formData, 'id');

  let result: ChannelTestResult;
  try {
    result = await post<ChannelTestResult>(`/channels/${id}/test`);
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao testar o canal' };
  }

  return {
    ok: true,
    message: `Canal validado (${result.provider}): ${result.destination.name ?? result.destination.id}`,
  };
}
