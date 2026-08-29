'use server';

import { requireAdmin } from '@/lib/auth';

import { revalidatePath } from 'next/cache';
import { ApiError, patch, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { optional, required } from '@/lib/form';
import {
  BatchEvaluationReport,
  BatchSyncReport,
  EvaluationResult,
  PopularityReport,
  Product,
  SyncResult,
} from '@/lib/types';

function revalidateProducts(): void {
  revalidatePath('/products');
  revalidatePath('/dashboard');
  revalidatePath('/opportunities');
}

export async function createProduct(_state: FormState, formData: FormData): Promise<FormState> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  try {
    await post<Product>('/products', {
      marketplace: required(formData, 'marketplace'),
      marketplaceItemId: required(formData, 'marketplaceItemId'),
      title: required(formData, 'title'),
      category: optional(formData, 'category'),
      imageUrl: optional(formData, 'imageUrl'),
      currentPrice: required(formData, 'currentPrice'),
      originalPrice: optional(formData, 'originalPrice'),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao criar o produto' };
  }

  revalidateProducts();
  return { ok: true };
}

export async function setProductActive(formData: FormData): Promise<void> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  const id = required(formData, 'id');
  const active = formData.get('active') === 'true';

  await patch<Product>(`/products/${id}`, { active });

  revalidateProducts();
}

/** Importa um anuncio real do Mercado Livre pelo id do item (ex.: MLB1234567890). */
export async function importProduct(_state: FormState, formData: FormData): Promise<FormState> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  const marketplaceItemId = required(formData, 'marketplaceItemId').toUpperCase();

  let result: SyncResult;
  try {
    result = await post<SyncResult>('/products/import', { marketplaceItemId });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao importar o produto' };
  }

  revalidateProducts();
  return { ok: true, message: describeSync(result) };
}

/** Sincroniza um unico produto. Erros sobem para a error boundary da rota. */
export async function syncProduct(formData: FormData): Promise<void> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  const id = required(formData, 'id');

  await post<SyncResult>(`/products/${id}/sync`);

  revalidateProducts();
  revalidatePath(`/products/${id}/prices`);
}

/** Sincroniza todos os produtos ativos e resume o relatorio do lote. */
export async function syncActiveProducts(_state: FormState): Promise<FormState> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  let report: BatchSyncReport;
  try {
    report = await post<BatchSyncReport>('/products/sync');
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao sincronizar o lote' };
  }

  revalidateProducts();

  return {
    ok: true,
    message:
      `Lote concluido - total ${report.total}, sincronizados ${report.synced}, ` +
      `sem alteracao ${report.unchanged}, falhas ${report.failed}` +
      (report.failures.length > 0
        ? ` (${report.failures.map((f) => `${f.marketplaceItemId}: ${f.reason}`).join('; ')})`
        : ''),
  };
}

function describeSync(result: SyncResult): string {
  const suffix = result.priceSnapshotCreated ? ' - novo preco registrado no historico' : '';

  if (result.outcome === 'created') return `Produto importado: ${result.product.title}${suffix}`;
  if (result.outcome === 'updated') return `Produto atualizado: ${result.product.title}${suffix}`;

  return `Sem alteracoes: ${result.product.title}`;
}

/** Avalia um unico produto no Opportunity Engine. */
export async function evaluateProduct(formData: FormData): Promise<void> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  const id = required(formData, 'id');

  await post<EvaluationResult>(`/products/${id}/evaluate`);

  revalidateProducts();
}

/** Avalia todos os produtos ativos e resume o resultado. */
export async function evaluateActiveProducts(_state: FormState): Promise<FormState> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  let report: BatchEvaluationReport;
  try {
    report = await post<BatchEvaluationReport>('/products/evaluate');
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao avaliar os ativos' };
  }

  revalidateProducts();

  return {
    ok: true,
    message:
      `Avaliacao concluida - total ${report.total}, aprovadas ${report.approved}, ` +
      `candidatas ${report.candidate}, ignoradas ${report.ignored}, ` +
      `sem link ${report.notEligible}, falhas ${report.failed} ` +
      `(${report.offersCreated} oferta(s) criada(s))`,
  };
}

/** Atualiza o sinal de popularidade a partir dos mais vendidos oficiais. */
export async function refreshPopularity(_state: FormState): Promise<FormState> {
  // Uma action nao e segura so porque a pagina exige login.
  await requireAdmin();

  let report: PopularityReport;
  try {
    report = await post<PopularityReport>('/products/refresh-popularity');
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao atualizar popularidade' };
  }

  revalidateProducts();

  return {
    ok: true,
    message:
      `Popularidade atualizada - ${report.categories} categoria(s), ` +
      `${report.productsChecked} produto(s) verificado(s), ${report.productsRanked} no ranking` +
      (report.failedCategories.length > 0
        ? ` (falhas: ${report.failedCategories.map((f) => f.categoryId).join(', ')})`
        : ''),
  };
}
