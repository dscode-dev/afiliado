'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE, FormState } from '@/components/form-state';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Gerando link...' : 'Gerar link de autorizacao'}
    </button>
  );
}

/**
 * Botao que pede a URL de autorizacao a API e a apresenta como link.
 *
 * A URL nao e aberta automaticamente: o operador precisa ver para onde esta
 * indo antes de entregar a conta do Mercado Livre. O link so vale 10 minutos.
 */
export function AuthorizeButton({
  action,
}: {
  action: (state: FormState) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction}>
      {state.error ? <div className="error">{state.error}</div> : null}
      <SubmitButton />
      {state.ok && state.message ? (
        <div className="notice" style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 8px' }}>
            Abra o link abaixo e autorize com a conta do Mercado Livre que tem a afiliacao. Vale por
            10 minutos.
          </p>
          <a href={state.message} target="_blank" rel="noreferrer noopener">
            Autorizar no Mercado Livre
          </a>
        </div>
      ) : null}
    </form>
  );
}
