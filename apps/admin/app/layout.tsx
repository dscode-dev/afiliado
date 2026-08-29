import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Garimpo',
  description: 'Inteligencia e distribuicao automatizada de boas oportunidades de compra.',
  icons: { icon: '/assets/logo.png' },
};

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products', label: 'Produtos' },
  { href: '/products/discover', label: 'Mais vendidos' },
  { href: '/opportunities', label: 'Oportunidades' },
  { href: '/affiliate-links', label: 'Links de afiliado' },
  { href: '/channels', label: 'Canais' },
  { href: '/offers', label: 'Ofertas' },
  { href: '/publications', label: 'Publicacoes' },
  { href: '/automation', label: 'Automacao' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="layout">
          <aside className="sidebar">
            {/* Logo original, sem alteracao de cor, corte ou proporcao (3:1). */}
            <img
              className="brand-logo"
              src="/assets/logo.png"
              alt="Garimpo"
              width={2172}
              height={724}
            />
            <p className="tagline">Boas oportunidades, garimpadas e distribuidas.</p>
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
