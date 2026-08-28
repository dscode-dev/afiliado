'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, patch, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { optional, required } from '@/lib/form';
import { Offer, OfferStatus } from '@/lib/types';

export async function createOffer(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    await post<Offer>('/offers', {
      productId: required(formData, 'productId'),
      price: required(formData, 'price'),
      originalPrice: optional(formData, 'originalPrice'),
      discountPercentage: optional(formData, 'discountPercentage'),
      ...(optional(formData, 'status') ? { status: optional(formData, 'status') } : {}),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao criar a oferta' };
  }

  revalidatePath('/offers');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function setOfferStatus(formData: FormData): Promise<void> {
  const id = required(formData, 'id');
  const status = required(formData, 'status') as OfferStatus;

  await patch<Offer>(`/offers/${id}`, { status });

  revalidatePath('/offers');
  revalidatePath('/dashboard');
}
