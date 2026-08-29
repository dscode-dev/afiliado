import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Garimpo',
  description: 'Inteligencia e distribuicao automatizada de boas oportunidades de compra.',
  icons: { icon: '/assets/logo.png' },
};

/**
 * Layout raiz. Deliberadamente minimo: a navegacao autenticada vive em
 * `(app)/layout.tsx`, para que `/login` nao herde a sidebar nem exija sessao.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
