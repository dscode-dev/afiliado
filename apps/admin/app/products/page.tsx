import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { CreateForm } from '@/components/create-form';
import { Field } from '@/components/form-state';
import { RowActionForm } from '@/components/row-action-form';
import { ActiveBadge, Empty, formatDate, formatMoney } from '@/components/ui';
import { getList } from '@/lib/api';
import { Product } from '@/lib/types';
import {
  createProduct,
  importProduct,
  setProductActive,
  syncActiveProducts,
  syncProduct,
} from './actions';

export const dynamic = 'force-dynamic';

const IMPORT_FIELDS: Field[] = [
  {
    kind: 'input',
    name: 'marketplaceItemId',
    label: 'Mercado Livre Item ID',
    type: 'text',
    required: true,
    placeholder: 'MLB1234567890',
  },
];

const MANUAL_FIELDS: Field[] = [
  {
    kind: 'select',
    name: 'marketplace',
    label: 'Marketplace',
    required: true,
    options: [{ value: 'MERCADO_LIVRE', label: 'Mercado Livre' }],
  },
  { kind: 'input', name: 'marketplaceItemId', label: 'ID no marketplace', type: 'text', required: true },
  { kind: 'input', name: 'title', label: 'Titulo', type: 'text', required: true },
  { kind: 'input', name: 'category', label: 'Categoria', type: 'text' },
  { kind: 'input', name: 'imageUrl', label: 'URL da imagem', type: 'url' },
  { kind: 'input', name: 'currentPrice', label: 'Preco atual', type: 'number', step: '0.01', required: true },
  { kind: 'input', name: 'originalPrice', label: 'Preco original', type: 'number', step: '0.01' },
];

export default async function ProductsPage() {
  const products = await getList<Product>('/products?take=100');

  return (
    <div>
      <header>
        <h2>Produtos</h2>
        <p>
          Importe anuncios reais pelo ID do Mercado Livre. O cadastro manual segue disponivel para
          casos excepcionais.
        </p>
      </header>

      <div className="card">
        <h3>Importar do Mercado Livre</h3>
        <CreateForm action={importProduct} fields={IMPORT_FIELDS} submitLabel="Importar" />
        <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>
          Reimportar o mesmo ID atualiza o produto existente — a operacao e idempotente.{' '}
          <Link href="/products/discover">Descobrir mais vendidos por categoria</Link>.
        </p>
      </div>

      <div className="card">
        <h3>Sincronizar ativos</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Busca titulo, imagem, categoria, status e preco oficial de todos os produtos ativos. Um
          item com falha nao interrompe o lote.
        </p>
        <ActionForm
          action={syncActiveProducts}
          label="Sincronizar ativos"
          pendingLabel="Sincronizando..."
        />
      </div>

      <div className="card">
        <h3>Cadastrados ({products.total})</h3>
        {products.data.length === 0 ? (
          <Empty>Nenhum produto cadastrado ainda.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Titulo</th>
                  <th>ID marketplace</th>
                  <th>Categoria</th>
                  <th>Preco atual</th>
                  <th>Preco original</th>
                  <th>Status ML</th>
                  <th>Estado</th>
                  <th>Ultima sync</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {products.data.map((product) => (
                  <tr key={product.id}>
                    <td>
                      {product.imageUrl ? (
                        <img className="thumb" src={product.imageUrl} alt="" />
                      ) : null}
                    </td>
                    <td className="wrap">
                      {product.permalink ? (
                        <a href={product.permalink} target="_blank" rel="noreferrer noopener">
                          {product.title}
                        </a>
                      ) : (
                        product.title
                      )}
                    </td>
                    <td>{product.marketplaceItemId}</td>
                    <td>{product.category ?? '—'}</td>
                    <td>{formatMoney(product.currentPrice)}</td>
                    <td>{formatMoney(product.originalPrice)}</td>
                    <td>{product.marketplaceStatus ?? '—'}</td>
                    <td>
                      <ActiveBadge active={product.active} />
                    </td>
                    <td>{formatDate(product.lastSyncedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <RowActionForm
                          action={syncProduct}
                          id={product.id}
                          values={{}}
                          label="Sincronizar"
                        />
                        <Link className="badge" href={`/products/${product.id}/prices`}>
                          Historico
                        </Link>
                        <RowActionForm
                          action={setProductActive}
                          id={product.id}
                          values={{ active: String(!product.active) }}
                          label={product.active ? 'Desativar' : 'Ativar'}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details className="card">
        <summary>Cadastro manual (excepcional)</summary>
        <div style={{ marginTop: 14 }}>
          <CreateForm action={createProduct} fields={MANUAL_FIELDS} submitLabel="Cadastrar produto" />
        </div>
      </details>
    </div>
  );
}
