import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { LogoutButton } from './logout-button';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/mercado-livre', label: 'Mercado Livre' },
  { href: '/products', label: 'Produtos' },
  { href: '/products/discover', label: 'Mais vendidos' },
  { href: '/opportunities', label: 'Oportunidades' },
  { href: '/affiliate-links', label: 'Links de afiliado' },
  { href: '/affiliate-automation', label: 'Automacao de afiliados' },
  { href: '/channels', label: 'Canais' },
  { href: '/offers', label: 'Ofertas' },
  { href: '/publications', label: 'Publicacoes' },
  { href: '/automation', label: 'Automacao' },
];

/**
 * Layout das rotas administrativas.
 *
 * `requireAdmin` valida a sessao contra a API a cada render; sem sessao,
 * redireciona para /login. Nao dependemos de esconder links.
 */
export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
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
        <div className="sidebar-footer">
          <span className="admin-email" title={admin.email}>
            {admin.email}
          </span>
          <LogoutButton />
        </div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
