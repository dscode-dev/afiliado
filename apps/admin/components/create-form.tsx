'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE, Field, FormState } from './form-state';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Salvando...' : label}
    </button>
  );
}

/**
 * Formulario de criacao usado por produtos, links, canais e ofertas.
 * Toda a validacao real acontece na API - aqui apenas exibimos a mensagem.
 */
export function CreateForm({
  action,
  fields,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: Field[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction}>
      {state.error ? <div className="error">{state.error}</div> : null}
      {state.message ? <div className="notice">{state.message}</div> : null}
      <div className="form-grid">
        {fields.map((field) =>
          field.kind === 'input' && field.type === 'hidden' ? (
            <input key={field.name} type="hidden" name={field.name} value={field.value} />
          ) : (
          <div key={field.name}>
            <label htmlFor={field.name}>
              {field.label}
              {field.required ? ' *' : ''}
            </label>
            {field.kind === 'select' ? (
              <select id={field.name} name={field.name} required={field.required} defaultValue="">
                {!field.required ? <option value="">—</option> : null}
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={field.name}
                name={field.name}
                type={field.type}
                step={field.step}
                required={field.required}
                placeholder={field.placeholder}
              />
            )}
          </div>
          ),
        )}
        <div>
          <SubmitButton label={submitLabel} />
        </div>
      </div>
    </form>
  );
}
