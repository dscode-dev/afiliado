import { RetryButton } from './retry-button';
import { Empty, StatusBadge, formatDate, formatMoney } from '@/components/ui';
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
          Registro de cada tentativa de publicacao no Telegram. Uma oferta e publicada no maximo
          uma vez por canal.
        </p>
      </header>

      <div className="card">
        <h3>Registradas ({publications.total})</h3>
        {publications.data.length === 0 ? (
          <Empty>
            Nenhuma publicacao ainda. Publique uma oportunidade APPROVED em Oportunidades.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Preco</th>
                  <th>Canal</th>
                  <th>Status</th>
                  <th>Publicado em</th>
                  <th>Mensagem</th>
                  <th>Erro</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {publications.data.map((publication) => (
                  <tr key={publication.id}>
                    <td className="wrap">
                      {publication.offer?.productTitle ?? publication.offer?.productId ?? '—'}
                    </td>
                    <td>{publication.offer ? formatMoney(publication.offer.price) : '—'}</td>
                    <td className="wrap">
                      {publication.channel?.name ?? publication.channelId}
                      {publication.channel ? (
                        <span className="muted"> ({publication.channel.type})</span>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={publication.status} />
                    </td>
                    <td>{formatDate(publication.publishedAt)}</td>
                    <td>{publication.externalMessageId ?? '—'}</td>
                    <td className="wrap muted">{publication.errorMessage ?? '—'}</td>
                    <td>
                      {publication.status === 'FAILED' ? (
                        <RetryButton id={publication.id} />
                      ) : null}
                    </td>
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
