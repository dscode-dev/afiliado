'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, del, post } from '@/lib/api';
import { FormState } from '@/components/form-state';
import { optional, required } from '@/lib/form';
import {
  AffiliateLink,
  EvaluationResult,
  ManualPublicationResult,
  OperatorDecision,
  PublishResult,
} from '@/lib/types';

function revalidateOpportunities(): void {
  revalidatePath('/opportunities');
  revalidatePath('/products');
  revalidatePath('/dashboard');
  revalidatePath('/publications');
}

/** Avalia um produto e devolve o resultado resumido ao operador. */
export async function evaluateProduct(formData: FormData): Promise<void> {
  const productId = required(formData, 'id');

  await post<EvaluationResult>(`/products/${productId}/evaluate`);

  revalidateOpportunities();
}

/** Registra a decisao humana, que convive com a recomendacao do engine. */
export async function decide(formData: FormData): Promise<void> {
  const productId = required(formData, 'id');
  const decision = required(formData, 'decision') as OperatorDecision;

  await post<EvaluationResult>(`/opportunities/${productId}/decision`, { decision });

  revalidateOpportunities();
}

/** Remove o override humano e devolve a decisao ao engine. */
export async function clearDecision(formData: FormData): Promise<void> {
  const productId = required(formData, 'id');

  await del<EvaluationResult>(`/opportunities/${productId}/decision`);

  revalidateOpportunities();
}

/**
 * Cadastra o link de afiliado sem sair do contexto da oportunidade e ja
 * reavalia: e exatamente o fluxo NOT_ELIGIBLE -> link -> APPROVED.
 */
export async function addLinkAndReevaluate(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const productId = required(formData, 'productId');

  try {
    await post<AffiliateLink>('/affiliate-links', {
      productId,
      url: required(formData, 'url'),
      sourceLabel: optional(formData, 'sourceLabel'),
    });

    const result = await post<EvaluationResult>(`/products/${productId}/evaluate`);

    revalidateOpportunities();

    return {
      ok: true,
      message: `Link cadastrado. Nova avaliacao: ${result.status} (score ${result.score}).`,
    };
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao cadastrar o link' };
  }
}

/**
 * Publica a oferta da oportunidade em um canal do Telegram.
 *
 * A idempotencia e garantida pela API (UNIQUE offer+canal): um segundo clique
 * recebe 409 e vira mensagem, nunca uma segunda mensagem no canal.
 */
export async function publishOpportunity(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const offerId = required(formData, 'offerId');
  const channelId = required(formData, 'channelId');

  let result: PublishResult;
  try {
    result = await post<PublishResult>(`/offers/${offerId}/publish`, { channelId });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao publicar' };
  }

  revalidateOpportunities();

  return {
    ok: true,
    message:
      `Publicado em ${result.provider} — ${result.publication.channel?.name ?? 'canal'} ` +
      `(id ${result.publication.externalMessageId}` +
      `${result.usedPhoto ? ', com imagem' : ', sem imagem'}).`,
  };
}

/**
 * Registra que o operador publicou manualmente no canal (WhatsApp).
 * Nada e enviado para fora: apenas gravamos o resultado.
 */
export async function confirmManualPublication(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const offerId = required(formData, 'offerId');
  const channelId = required(formData, 'channelId');

  let result: ManualPublicationResult;
  try {
    result = await post<ManualPublicationResult>(`/offers/${offerId}/manual-publication`, {
      channelId,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Falha ao registrar' };
  }

  revalidateOpportunities();

  return {
    ok: true,
    message: `Registrado como publicado em ${result.provider} — ${result.publication.channel?.name ?? 'canal'}.`,
  };
}
