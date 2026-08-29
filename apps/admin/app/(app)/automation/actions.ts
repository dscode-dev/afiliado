'use server';

import { requireAdmin } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { ApiError, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { CycleSummary } from '@/lib/types';

/**
 * Executa agora exatamente o mesmo pipeline que o scheduler executa.
 * Nao existe segunda implementacao.
 */
export async function runCycleNow(_state: FormState): Promise<FormState> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  let summary: CycleSummary;

  try {
    summary = await post<CycleSummary>('/automation/run');
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao executar o ciclo' };
  }

  revalidatePath('/automation');
  revalidatePath('/opportunities');
  revalidatePath('/publications');
  revalidatePath('/products');

  const parts = [
    `sincronizados ${summary.productRefresh?.synced ?? 0}`,
    `avaliados ${summary.evaluation?.evaluated ?? 0}`,
    `aprovados ${summary.evaluation?.approved ?? 0}`,
    `publicados ${summary.distribution?.published ?? 0}`,
  ];

  return {
    ok: true,
    message: `Ciclo concluido em ${(summary.durationMs / 1000).toFixed(1)}s - ${parts.join(', ')}.`,
  };
}
