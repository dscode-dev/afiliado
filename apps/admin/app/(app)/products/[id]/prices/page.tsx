import Link from 'next/link';
import { RowActionForm } from '@/components/row-action-form';
import { Empty, formatDate, formatMoney } from '@/components/ui';
import { getOne } from '@/lib/api';
import { PriceSnapshot, Product } from '@/lib/types';
import { syncProduct } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function PriceHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [product, history] = await Promise.all([
    getOne<Product>(`/products/${id}`),
    getOne<PriceSnapshot[]>(`/products/${id}/prices?limit=100`),
  ]);

  return (
    <div>
      <header>
        <h2>{product.title}</h2>
        <p>
          <Link href="/products">← Produtos</Link> &middot; {product.marketplaceItemId}
          {product.category ? ` · ${product.category}` : ''}
        </p>
      </header>

      <div className="metrics">
        <div className="metric">
          <div className="value">{formatMoney(product.currentPrice)}</div>
          <div className="label">Preco atual</div>
        </div>
        <div className="metric">
          <div className="value" style={{ fontSize: 18 }}>
            {formatMoney(product.originalPrice)}
          </div>
          <div className="label">Preco original</div>
        </div>
        <div className="metric">
          <div className="value" style={{ fontSize: 15 }}>
            {formatDate(product.lastSyncedAt)}
          </div>
          <div className="label">Ultima sincronizacao</div>
        </div>
        <div className="metric">
          <div className="value">{history.length}</div>
          <div className="label">Pontos no historico</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Historico de precos</h3>
        {history.length === 0 ? (
          <Empty>
            Nenhum preco registrado ainda. Sincronize o produto para capturar o primeiro ponto.
          </Empty>
        ) : (
          <ul className="history-list">
            {history.map((snapshot) => (
              <li key={snapshot.capturedAt}>
                <span className="price">
                  {formatMoney(snapshot.price)}
                  {snapshot.originalPrice ? (
                    <span className="was">{formatMoney(snapshot.originalPrice)}</span>
                  ) : null}
                </span>
                <span className="muted">{formatDate(snapshot.capturedAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Um ponto novo so e gravado quando o preco muda.
        </p>
      </div>

      <div className="card">
        <h3>Sincronizar agora</h3>
        <RowActionForm action={syncProduct} id={product.id} values={{}} label="Sincronizar" />
      </div>
    </div>
  );
}
