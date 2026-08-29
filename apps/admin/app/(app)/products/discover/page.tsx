import Link from 'next/link';
import { RowActionForm } from '@/components/row-action-form';
import { Empty, formatMoney } from '@/components/ui';
import { ApiError, getOne } from '@/lib/api';
import { HighlightsResult } from '@/lib/types';
import { importDiscovered } from './actions';

export const dynamic = 'force-dynamic';

/** Atalhos para categorias comuns do MLB; o operador pode digitar qualquer id. */
const SUGGESTED = [
  { id: 'MLB1051', label: 'Celulares e Telefones' },
  { id: 'MLB1000', label: 'Eletronicos, Audio e Video' },
  { id: 'MLB1648', label: 'Informatica' },
  { id: 'MLB1276', label: 'Esportes e Fitness' },
];

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string }>;
}) {
  const { categoryId } = await searchParams;

  let highlights: HighlightsResult | null = null;
  let error: string | null = null;

  if (categoryId) {
    try {
      highlights = await getOne<HighlightsResult>(
        `/marketplace/mercado-livre/highlights?categoryId=${encodeURIComponent(categoryId)}`,
      );
    } catch (cause) {
      error = cause instanceof ApiError ? cause.message : 'Falha ao consultar os mais vendidos';
    }
  }

  return (
    <div>
      <header>
        <h2>Mais vendidos</h2>
        <p>
          Ranking oficial do Mercado Livre por categoria. Nada e salvo automaticamente:{' '}
          <Link href="/products">importe</Link> apenas o que voce quer monitorar.
        </p>
      </header>

      <div className="card">
        <h3>Consultar categoria</h3>
        <form method="GET" action="/products/discover">
          <div className="form-grid">
            <div>
              <label htmlFor="categoryId">ID da categoria *</label>
              <input
                id="categoryId"
                name="categoryId"
                type="text"
                required
                defaultValue={categoryId ?? ''}
                placeholder="MLB1051"
              />
            </div>
            <div>
              <button type="submit">Consultar</button>
            </div>
          </div>
        </form>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 10 }}>
          Sugestoes:{' '}
          {SUGGESTED.map((category, index) => (
            <span key={category.id}>
              {index > 0 ? ' · ' : ''}
              <Link href={`/products/discover?categoryId=${category.id}`}>{category.label}</Link>
            </span>
          ))}
        </p>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {highlights ? (
        <div className="card">
          <h3>
            {highlights.categoryName ?? highlights.categoryId} — {highlights.total} itens
          </h3>
          {highlights.data.length === 0 ? (
            <Empty>Nenhum destaque retornado para esta categoria.</Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th />
                    <th>Titulo</th>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>Preco</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {highlights.data.map((entry) => (
                    <tr key={`${entry.type}-${entry.id}`}>
                      <td>{entry.position}</td>
                      <td>
                        {entry.imageUrl ? (
                            <img className="thumb" src={entry.imageUrl} alt="" />
                        ) : null}
                      </td>
                      <td className="wrap">
                        {entry.permalink ? (
                          <a href={entry.permalink} target="_blank" rel="noreferrer noopener">
                            {entry.title ?? '(titulo nao resolvido)'}
                          </a>
                        ) : (
                          (entry.title ?? <span className="muted">(titulo nao resolvido)</span>)
                        )}
                      </td>
                      <td>{entry.itemId ?? entry.id}</td>
                      <td>{entry.type}</td>
                      <td>{formatMoney(entry.price)}</td>
                      <td>
                        {entry.itemId ? (
                          <RowActionForm
                            action={importDiscovered}
                            id={entry.itemId}
                            values={{ categoryId: highlights.categoryId }}
                            label="Importar"
                          />
                        ) : (
                          <span className="muted">sem item</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
