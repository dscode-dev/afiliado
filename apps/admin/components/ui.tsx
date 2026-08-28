export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`badge ${active ? 'on' : 'off'}`}>{active ? 'ativo' : 'inativo'}</span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className="badge">{status}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';

  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function formatMoney(value: string | null): string {
  if (value === null) return '—';

  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value),
  );
}
