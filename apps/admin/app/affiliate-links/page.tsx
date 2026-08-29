import { CreateForm } from '@/components/create-form';
import { Field } from '@/components/form-state';
import { RowActionForm } from '@/components/row-action-form';
import { ActiveBadge, Empty, formatDate } from '@/components/ui';
import { getList } from '@/lib/api';
import { AffiliateLink, Product } from '@/lib/types';
import { createAffiliateLink, setAffiliateLinkActive } from './actions';

export const dynamic = 'force-dynamic';

export default async function AffiliateLinksPage() {
  const [links, products] = await Promise.all([
    getList<AffiliateLink>('/affiliate-links?take=100'),
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
      name: 'url',
      label: 'URL de afiliado',
      type: 'url',
      required: true,
      placeholder: 'https://mercadolivre.com/sec/...',
    },
    { kind: 'input', name: 'label', label: 'Tag / rotulo', type: 'text' },
    {
      kind: 'input',
      name: 'sourceLabel',
      label: 'Origem',
      type: 'text',
      placeholder: 'painel-afiliados',
    },
    { kind: 'input', name: 'channelTag', label: 'Canal', type: 'text', placeholder: 'telegram' },
  ];

  return (
    <div>
      <header>
        <h2>Links de afiliado</h2>
        <p>Cadastro manual do link. Nao ha geracao automatica neste PR.</p>
      </header>

      <div className="card">
        <h3>Novo link</h3>
        {products.data.length === 0 ? (
          <Empty>Cadastre um produto ativo antes de registrar um link.</Empty>
        ) : (
          <CreateForm
            action={createAffiliateLink}
            fields={fields}
            submitLabel="Cadastrar link"
          />
        )}
      </div>

      <div className="card">
        <h3>Cadastrados ({links.total})</h3>
        {links.data.length === 0 ? (
          <Empty>Nenhum link cadastrado ainda.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>URL</th>
                  <th>Tag</th>
                  <th>Origem</th>
                  <th>Canal</th>
                  <th>Estado</th>
                  <th>Criado em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {links.data.map((link) => (
                  <tr key={link.id}>
                    <td className="wrap">{link.product?.title ?? link.productId}</td>
                    <td className="wrap">
                      <a href={link.url} target="_blank" rel="noreferrer noopener">
                        {link.url}
                      </a>
                    </td>
                    <td>{link.label ?? '—'}</td>
                    <td>{link.sourceLabel ?? '—'}</td>
                    <td>{link.channelTag ?? '—'}</td>
                    <td>
                      <ActiveBadge active={link.active} />
                    </td>
                    <td>{formatDate(link.createdAt)}</td>
                    <td>
                      <RowActionForm
                        action={setAffiliateLinkActive}
                        id={link.id}
                        values={{ active: String(!link.active) }}
                        label={link.active ? 'Desativar' : 'Ativar'}
                      />
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
