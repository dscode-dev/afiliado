import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Empty, formatDate } from '@/components/ui';
import { getList, getOne } from '@/lib/api';
import { AffiliateBotStatus, Product } from '@/lib/types';
import { generateMissingLinks } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; badge: string }> = {
  READY: { label: 'Sessao ativa', badge: 'approved' },
  AUTH_REQUIRED: { label: 'Autenticacao necessaria', badge: 'candidate' },
  UNAVAILABLE: { label: 'Bot indisponivel', badge: 'rejected' },
};

export default async function AffiliateAutomationPage() {
  const [status, products] = await Promise.all([
    getOne<AffiliateBotStatus>('/affiliate-links/generation/status'),
    getList<Product>('/products?active=true&take=100'),
  ]);

  // Produtos ativos sem link ativo: a fila de trabalho do gerador.
  const links = await getList<{ productId: string; active: boolean }>(
    '/affiliate-links?active=true&take=100',
  );
  const withLink = new Set(links.data.map((link) => link.productId));
  const missing = products.data.filter((product) => !withLink.has(product.id));

  const state = STATUS_LABEL[status.status] ?? STATUS_LABEL.UNAVAILABLE;

  return (
    <div>
      <header>
        <h2>Automacao de afiliados</h2>
        <p>
          O Garimpo gera os links sozinho a partir da Central de Afiliados. Nenhuma acao por
          produto — o operador so autentica a sessao quando ela expira.
        </p>
      </header>

      <div className="metrics">
        <div className="metric">
          <div className="value">
            <span className={`badge ${state.badge}`}>{state.label}</span>
          </div>
          <div className="label">Sessao da Central</div>
        </div>
        <div className="metric">
          <div className="value" style={{ fontSize: 18 }}>
            {status.tag ?? '—'}
          </div>
          <div className="label">Tag ativa</div>
        </div>
        <div className="metric">
          <div className="value">{missing.length}</div>
          <div className="label">Produtos sem link</div>
        </div>
      </div>

      {status.status === 'AUTH_REQUIRED' ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h3>Reautenticar a Central</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            A sessao do navegador expirou. Rode no servidor do affiliate-bot:
          </p>
          <pre className="manual-preview" style={{ minHeight: 0, padding: 10 }}>
            npm run affiliate:login
          </pre>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            Uma janela abre para voce entrar no Mercado Livre. A sessao fica salva no perfil
            persistente e e reaproveitada — isso nao e operacao por produto.
          </p>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Gerar links que faltam</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Percorre os produtos ativos sem link e gera cada um pela Central. Tambem roda sozinho no
          ciclo de <Link href="/automation">automacao</Link>.
        </p>
        <ActionForm
          action={generateMissingLinks}
          label="Gerar links que faltam"
          pendingLabel="Gerando..."
        />
      </div>

      <div className="card">
        <h3>Produtos sem link ({missing.length})</h3>
        {missing.length === 0 ? (
          <Empty>Todos os produtos ativos ja possuem link de afiliado.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>ID marketplace</th>
                  <th>Ultima sync</th>
                </tr>
              </thead>
              <tbody>
                {missing.slice(0, 30).map((product) => (
                  <tr key={product.id}>
                    <td className="wrap">{product.title}</td>
                    <td>{product.marketplaceItemId}</td>
                    <td>{formatDate(product.lastSyncedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Produto sem link nunca e publicado: a oportunidade fica <code>NOT_ELIGIBLE</code>.
        </p>
      </div>
    </div>
  );
}
