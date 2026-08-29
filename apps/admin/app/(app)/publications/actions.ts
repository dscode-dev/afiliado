'use server';

import { requireAdmin } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { ApiError, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { required } from '@/lib/form';
import { PublishResult } from '@/lib/types';

/** Reenvia uma publicacao FAILED. O registro existente e reaproveitado. */
export async function retryPublication(_state: FormState, formData: FormData): Promise<FormState> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  const id = required(formData, 'id');

  let result: PublishResult;
  try {
    result = await post<PublishResult>(`/publications/${id}/retry`);
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao reenviar' };
  }

  revalidatePath('/publications');
  revalidatePath('/opportunities');

  return {
    ok: true,
    message: `Publicado em ${result.provider} — ${result.publication.channel?.name ?? 'canal'} (id ${result.publication.externalMessageId}).`,
  };
}
