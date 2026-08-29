'use server';

import { requireAdmin } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { post } from '@/lib/api';
import { required } from '@/lib/form';
import { SyncResult } from '@/lib/types';

/**
 * Importa um item descoberto no ranking. Recebe o id do item pelo campo `id`
 * do formulario de linha, igual as demais acoes de tabela.
 */
export async function importDiscovered(formData: FormData): Promise<void> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  const marketplaceItemId = required(formData, 'id');

  await post<SyncResult>('/products/import', { marketplaceItemId });

  revalidatePath('/products');
  revalidatePath('/dashboard');
  revalidatePath('/products/discover');
}
