import { getOne } from '@/lib/api';
import { DashboardSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

const METRICS: { key: keyof DashboardSummary; label: string }[] = [
  { key: 'activeProducts', label: 'Produtos ativos' },
  { key: 'activeAffiliateLinks', label: 'Links afiliados ativos' },
  { key: 'activeChannels', label: 'Canais ativos' },
  { key: 'openOffers', label: 'Ofertas abertas' },
  { key: 'publications', label: 'Publicacoes' },
  { key: 'pendingPublications', label: 'Publicacoes pendentes' },
];

export default async function DashboardPage() {
  const summary = await getOne<DashboardSummary>('/analytics/summary');

  return (
    <div>
      <header className="dashboard-header">
        {/* Logo original, sem alteracao. `height: auto` preserva a proporcao. */}
        <img className="dashboard-logo" src="/assets/logo.png" alt="Garimpo" />
        <div>
          {/* A logo ja e o wordmark: repetir "Garimpo" em texto seria redundante. */}
          <h2 className="visually-hidden">Garimpo</h2>
          <p>Inteligencia e distribuicao automatizada de boas oportunidades de compra.</p>
        </div>
      </header>

      <div className="metrics">
        {METRICS.map((metric) => (
          <div className="metric" key={metric.key}>
            <div className="value">{summary[metric.key]}</div>
            <div className="label">{metric.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
