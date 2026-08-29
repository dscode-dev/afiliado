'use server';

import { requireAdmin } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { ApiError, patch, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { optional, required } from '@/lib/form';
import { AffiliateLink } from '@/lib/types';

export async function createAffiliateLink(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  try {
    await post<AffiliateLink>('/affiliate-links', {
      productId: required(formData, 'productId'),
      url: required(formData, 'url'),
      label: optional(formData, 'label'),
      sourceLabel: optional(formData, 'sourceLabel'),
      channelTag: optional(formData, 'channelTag'),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao criar o link' };
  }

  revalidatePath('/affiliate-links');
  revalidatePath('/dashboard');
  // Um link novo pode tornar uma oportunidade elegivel.
  revalidatePath('/opportunities');
  return { ok: true };
}

export async function setAffiliateLinkActive(formData: FormData): Promise<void> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  const id = required(formData, 'id');
  const active = formData.get('active') === 'true';

  await patch<AffiliateLink>(`/affiliate-links/${id}`, { active });

  revalidatePath('/affiliate-links');
  revalidatePath('/dashboard');
}
