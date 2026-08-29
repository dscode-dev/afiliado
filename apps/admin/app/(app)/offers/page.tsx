import { CreateForm } from '@/components/create-form';
import { Field } from '@/components/form-state';
import { RowActionForm } from '@/components/row-action-form';
import { Empty, StatusBadge, formatDate, formatMoney } from '@/components/ui';
import { getList } from '@/lib/api';
import { Offer, OFFER_STATUSES, Product } from '@/lib/types';
import { createOffer, setOfferStatus } from './actions';

export const dynamic = 'force-dynamic';

/** Proxima transicao oferecida como acao rapida na tabela. */
const NEXT_STATUS: Partial<Record<Offer['status'], Offer['status']>> = {
  DETECTED: 'CANDIDATE',
  CANDIDATE: 'APPROVED',
};

export default async function OffersPage() {
  const [offers, products] = await Promise.all([
    getList<Offer>('/offers?take=100'),
    getList<Product>('/products?active=true&take=100'),
  ]);

  const fields: Field[] = [
    {
      kind: 'select',
      name: 'productId',
      label: 'Produto',
      required: true,
      options: products.data.map((product) => ({
        value: product.id,
        label: `${product.marketplaceItemId} — ${product.title}`,
      })),
    },
    {
      kind: 'input',
      name: 'price',
      label: 'Preco da oferta',
      type: 'number',
      step: '0.01',
      required: true,
    },
    { kind: 'input', name: 'originalPrice', label: 'Preco original', type: 'number', step: '0.01' },
    {
      kind: 'input',
      name: 'discountPercentage',
      label: 'Desconto (%)',
      type: 'number',
      step: '0.01',
    },
    {
      kind: 'select',
      name: 'status',
      label: 'Status inicial',
      options: OFFER_STATUSES.map((status) => ({ value: status, label: status })),
    },
  ];

  return (
    <div>
      <header>
        <h2>Ofertas</h2>
        <p>
          Cadastro manual. A deteccao automatica e o Opportunity Score entram em PR posterior.
        </p>
      </header>

      <div className="card">
        <h3>Nova oferta</h3>
        {products.data.length === 0 ? (
          <Empty>Cadastre um produto ativo antes de registrar uma oferta.</Empty>
        ) : (
          <CreateForm action={createOffer} fields={fields} submitLabel="Cadastrar oferta" />
        )}
      </div>

      <div className="card">
        <h3>Registradas ({offers.total})</h3>
        {offers.data.length === 0 ? (
          <Empty>Nenhuma oferta registrada ainda.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Preco</th>
                  <th>Original</th>
                  <th>Desconto</th>
                  <th>Status</th>
                  <th>Detectada em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {offers.data.map((offer) => {
                  const next = NEXT_STATUS[offer.status];

                  return (
                    <tr key={offer.id}>
                      <td className="wrap">{offer.product?.title ?? offer.productId}</td>
                      <td>{formatMoney(offer.price)}</td>
                      <td>{formatMoney(offer.originalPrice)}</td>
                      <td>
                        {offer.discountPercentage ? `${offer.discountPercentage}%` : '—'}
                      </td>
                      <td>
                        <StatusBadge status={offer.status} />
                      </td>
                      <td>{formatDate(offer.detectedAt)}</td>
                      <td>
                        {next ? (
                          <RowActionForm
                            action={setOfferStatus}
                            id={offer.id}
                            values={{ status: next }}
                            label={`Marcar ${next}`}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
