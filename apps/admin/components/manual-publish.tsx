'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE, FormState } from './form-state';

interface ManualChannel {
  id: string;
  name: string;
  provider: string;
}

export interface ManualPreviewData {
  channelId: string;
  text: string;
  affiliateUrl: string;
  imageUrl: string | null;
  alreadyPublished: boolean;
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="secondary" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Copia para a area de transferencia, com confirmacao visual curta. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="secondary"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => setCopied(false),
        );
      }}
    >
      {copied ? 'Copiado!' : label}
    </button>
  );
}

/**
 * Fluxo semiassistido do WhatsApp.
 *
 * Nao existe API oficial para publicar em Canais do WhatsApp, entao o painel
 * prepara o conteudo, o operador cola no aplicativo e depois confirma aqui.
 */
export function ManualPublish({
  offerId,
  channels,
  previews,
  confirmAction,
}: {
  offerId: string;
  channels: ManualChannel[];
  previews: ManualPreviewData[];
  confirmAction: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(confirmAction, EMPTY_FORM_STATE);
  const [selected, setSelected] = useState(channels[0]?.id ?? '');

  const preview = previews.find((candidate) => candidate.channelId === selected);

  return (
    <div className="manual-box">
      <strong style={{ fontSize: 13 }}>Preparar publicacao manual (WhatsApp)</strong>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
        O WhatsApp nao oferece API oficial para publicar em Canais. Copie o texto, publique no
        canal e marque como publicado aqui.
      </p>

      {channels.length > 1 ? (
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          aria-label="Canal"
          style={{ maxWidth: 260, marginBottom: 10 }}
        >
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.provider} — {channel.name}
            </option>
          ))}
        </select>
      ) : null}

      {preview ? (
        <>
          <textarea className="manual-preview" readOnly value={preview.text} />
          <div className="row-actions" style={{ marginTop: 8 }}>
            <CopyButton value={preview.text} label="Copiar texto" />
            <CopyButton value={preview.affiliateUrl} label="Copiar link" />
            {preview.imageUrl ? (
              <a
                className="badge"
                href={preview.imageUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Abrir imagem
              </a>
            ) : null}
            {preview.alreadyPublished ? (
              <span className="badge approved">Ja publicado</span>
            ) : (
              <form action={formAction} className="inline-form">
                <input type="hidden" name="offerId" value={offerId} />
                <input type="hidden" name="channelId" value={selected} />
                <Submit label="Marcar como publicado" pendingLabel="Registrando..." />
              </form>
            )}
          </div>
        </>
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          Preview indisponivel para este canal.
        </p>
      )}

      {state.error ? <div className="error">{state.error}</div> : null}
      {state.message ? <div className="notice">{state.message}</div> : null}
    </div>
  );
}
