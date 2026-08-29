'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE } from '@/components/form-state';
import { retryPublication } from './actions';

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="secondary" disabled={pending}>
      {pending ? 'Reenviando...' : 'Tentar novamente'}
    </button>
  );
}

/** Reenvio de uma publicacao FAILED, com o resultado exibido na propria linha. */
export function RetryButton({ id }: { id: string }) {
  const [state, formAction] = useActionState(retryPublication, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <Submit />
      {state.error ? <div className="error">{state.error}</div> : null}
      {state.message ? <div className="notice">{state.message}</div> : null}
    </form>
  );
}
