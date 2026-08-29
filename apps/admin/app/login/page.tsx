import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { currentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Entrar · Garimpo' };

export default async function LoginPage() {
  // Ja autenticado nao volta para o login.
  if (await currentAdmin()) redirect('/dashboard');

  return (
    <div className="login-screen">
      <div className="login-card">
        {/* Logo original, sem alteracao. `height: auto` preserva a proporcao. */}
        <img className="login-logo" src="/assets/logo.png" alt="Garimpo" />
        <p className="login-tagline">Painel administrativo</p>
        <LoginForm />
      </div>
    </div>
  );
}
