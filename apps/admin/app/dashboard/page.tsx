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
      <header>
        <h2>Dashboard</h2>
        <p>Contadores da fundacao. Deteccao automatica e publicacao chegam nos proximos PRs.</p>
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
