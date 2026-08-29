'use server';

import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { ApiError, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { AffiliateGenerationReport } from '@/lib/types';

/** Gera os links que faltam. Nenhuma acao por produto. */
export async function generateMissingLinks(_state: FormState): Promise<FormState> {
  await requireAdmin();

  let report: AffiliateGenerationReport;
  try {
    report = await post<AffiliateGenerationReport>('/affiliate-links/generate');
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao gerar os links' };
  }

  revalidatePath('/affiliate-automation');
  revalidatePath('/affiliate-links');
  revalidatePath('/opportunities');

  return {
    ok: true,
    message:
      `Concluido - ${report.total} sem link, ${report.generated} gerado(s), ` +
      `${report.failed} falha(s)` +
      (report.authRequired > 0 ? '. Sessao da Central expirada: reautentique.' : '.'),
  };
}
