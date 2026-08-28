'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, patch, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { optional, required } from '@/lib/form';
import { AffiliateLink } from '@/lib/types';

export async function createAffiliateLink(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await post<AffiliateLink>('/affiliate-links', {
      productId: required(formData, 'productId'),
      url: required(formData, 'url'),
      label: optional(formData, 'label'),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao criar o link' };
  }

  revalidatePath('/affiliate-links');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setAffiliateLinkActive(formData: FormData): Promise<void> {
  const id = required(formData, 'id');
  const active = formData.get('active') === 'true';

  await patch<AffiliateLink>(`/affiliate-links/${id}`, { active });

  revalidatePath('/affiliate-links');
  revalidatePath('/dashboard');
}
