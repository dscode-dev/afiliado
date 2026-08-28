'use client';

import { useFormStatus } from 'react-dom';

function ActionButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="secondary" disabled={pending}>
      {pending ? '...' : label}
    </button>
  );
}

/**
 * Acao inline de uma linha da tabela (ativar/desativar, mudar status).
 * Envia apenas o id e os valores fixos declarados em `values`.
 */
export function RowActionForm({
  action,
  id,
  values,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  values: Record<string, string>;
  label: string;
}) {
  return (
    <form action={action} className="inline-form">
      <input type="hidden" name="id" value={id} />
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <ActionButton label={label} />
    </form>
  );
}
