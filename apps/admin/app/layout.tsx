import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Afiliado - Admin',
  description: 'Painel administrativo interno de ofertas afiliadas',
};

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products', label: 'Produtos' },
  { href: '/products/discover', label: 'Mais vendidos' },
  { href: '/affiliate-links', label: 'Links de afiliado' },
  { href: '/channels', label: 'Canais' },
  { href: '/offers', label: 'Ofertas' },
  { href: '/publications', label: 'Publicacoes' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="layout">
          <aside className="sidebar">
            <h1>Afiliado</h1>
            <p className="tagline">Admin interno &middot; PR-01</p>
            <nav>
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
