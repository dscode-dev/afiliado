'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE, FormState } from './form-state';

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * Acao sem formulario (ex.: sincronizar todos os ativos), que ainda assim
 * precisa reportar resultado ou erro ao operador.
 */
export function ActionForm({
  action,
  label,
  pendingLabel,
}: {
  action: (state: FormState) => Promise<FormState>;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction}>
      {state.error ? <div className="error">{state.error}</div> : null}
      {state.message ? <div className="notice">{state.message}</div> : null}
      <SubmitButton label={label} pendingLabel={pendingLabel} />
    </form>
  );
}
