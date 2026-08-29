'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE, FormState } from './form-state';

interface ChannelOption {
  id: string;
  name: string;
}

function Submit() {
  const { pending } = useFormStatus();

  // Desabilitar durante o envio evita o clique repetido; a garantia real
  // contra duplicidade continua sendo a constraint no banco.
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Publicando...' : 'Publicar'}
    </button>
  );
}

export function PublishForm({
  action,
  offerId,
  channels,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  offerId: string;
  channels: ChannelOption[];
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="publish-form">
      <input type="hidden" name="offerId" value={offerId} />
      {channels.length === 1 ? (
        <input type="hidden" name="channelId" value={channels[0].id} />
      ) : (
        <select name="channelId" defaultValue={channels[0]?.id} aria-label="Canal">
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      )}
      <Submit />
      {state.error ? <div className="error">{state.error}</div> : null}
      {state.message ? <div className="notice">{state.message}</div> : null}
    </form>
  );
}
