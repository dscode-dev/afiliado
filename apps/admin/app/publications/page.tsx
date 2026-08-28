import { Empty, StatusBadge, formatDate } from '@/components/ui';
import { getList } from '@/lib/api';
import { Publication } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PublicationsPage() {
  const publications = await getList<Publication>('/publications?take=100');

  return (
    <div>
      <header>
        <h2>Publicacoes</h2>
        <p>
          Somente leitura. As publicacoes passam a ser criadas pelos workers no PR de
          distribuicao.
        </p>
      </header>

      <div className="card">
        <h3>Registradas ({publications.total})</h3>
        {publications.data.length === 0 ? (
          <Empty>
            Nenhuma publicacao registrada. Nada e publicado automaticamente neste PR.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Canal</th>
                  <th>Tipo</th>
                  <th>Oferta</th>
                  <th>Status</th>
                  <th>Agendada</th>
                  <th>Publicada</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {publications.data.map((publication) => (
                  <tr key={publication.id}>
                    <td className="wrap">{publication.channel?.name ?? publication.channelId}</td>
                    <td>{publication.channel?.type ?? '—'}</td>
                    <td>{publication.offerId}</td>
                    <td>
                      <StatusBadge status={publication.status} />
                    </td>
                    <td>{formatDate(publication.scheduledAt)}</td>
                    <td>{formatDate(publication.publishedAt)}</td>
                    <td className="wrap">{publication.errorMessage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
