'use client';

import { useFormStatus } from 'react-dom';
import { logout } from './logout-actions';

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="secondary" disabled={pending}>
      {pending ? 'Saindo...' : 'Sair'}
    </button>
  );
}

export function LogoutButton() {
  return (
    <form action={logout}>
      <Submit />
    </form>
  );
}
