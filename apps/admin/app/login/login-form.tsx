'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { EMPTY_FORM_STATE } from '@/components/form-state';
import { login } from './actions';

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} style={{ width: '100%' }}>
      {pending ? 'Entrando...' : 'Entrar'}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(login, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="login-form">
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div>
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error ? <div className="error">{state.error}</div> : null}
      <Submit />
    </form>
  );
}
