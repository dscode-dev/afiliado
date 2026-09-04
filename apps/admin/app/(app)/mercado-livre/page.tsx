import Link from 'next/link';
import { CreateForm } from '@/components/create-form';
import { getOne } from '@/lib/api';
import { MercadoLivreAuthStatus } from '@/lib/types';
import { AuthorizeButton } from './authorize-button';
import { completeAuthorization, startAuthorization } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Autorizacao do Mercado Livre (Authorization Code).
 *
 * `client_credentials` alcanca apenas /categories: itens, precos, highlights e
 * vendedores exigem contexto de usuario. O operador autoriza UMA vez; depois o
 * refresh token rotativo mantem a integracao viva sozinha.
 */
export default async function MercadoLivrePage() {
  const status = await getOne<MercadoLivreAuthStatus>('/auth/mercado-livre/status');

  return (
    <div>
      <header>
        <h2>Mercado Livre</h2>
        <p>
          Sem esta autorizacao o Garimpo nao le itens, precos nem mais vendidos — e sem produto nao
          ha o que publicar. Autorize uma vez; a renovacao e automatica.
        </p>
      </header>

      <div className="metrics">
        <div className="metric">
          <div className="value">
            <span className={`badge ${status.authorized ? 'approved' : 'rejected'}`}>
              {status.authorized ? 'Autorizado' : 'Nao autorizado'}
            </span>
          </div>
          <div className="label">Situacao</div>
        </div>
        <div className="metric">
          <div className="value" style={{ fontSize: 18 }}>
            {status.externalUserId ?? '—'}
          </div>
          <div className="label">Usuario do Mercado Livre</div>
        </div>
        <div className="metric">
          <div className="value">
            <span className={`badge ${status.configured ? 'on' : 'off'}`}>
              {status.configured ? 'completa' : 'incompleta'}
            </span>
          </div>
          <div className="label">Configuracao</div>
        </div>
      </div>

      {!status.configured ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h3>Configuracao incompleta</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Faltam <code>MELI_CLIENT_ID</code>, <code>MELI_CLIENT_SECRET</code> ou{' '}
            <code>MELI_TOKEN_SECRET</code> no <code>.env</code> da raiz. Sem a chave de cifra nao ha
            onde guardar o refresh token com seguranca.
          </p>
        </div>
      ) : null}

      {status.authorized ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h3>Tudo certo</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            A credencial esta guardada e se renova sozinha. Nao ha nada a fazer aqui — siga para{' '}
            <Link href="/products/discover">Mais vendidos</Link> e importe os primeiros produtos.
          </p>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 20 }}>
        <h3>{status.authorized ? 'Reautorizar' : 'Autorizar'}</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          A URI de redirect registrada nesta instalacao e{' '}
          <code>{status.redirectUri ?? 'nao configurada'}</code>. Ela precisa ser exatamente a mesma
          cadastrada em <em>Minhas aplicacoes</em> no Mercado Livre Developers — o ML compara
          caractere a caractere.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Depois de autorizar, o Mercado Livre volta sozinho para essa URI e a tela de sucesso
          aparece. <strong>Se isso acontecer, terminou</strong> — nao ha proximo passo.
        </p>
        <AuthorizeButton action={startAuthorization} />
      </div>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          O navegador nao conseguiu abrir a URI de retorno?
        </summary>
        <p className="muted" style={{ fontSize: 13 }}>
          Use isto <strong>somente</strong> quando o navegador falhar ao abrir a URI de retorno
          (dominio ainda nao publicado, certificado recusado). Nesse caso a pagina de erro ainda
          traz o <code>code</code> na barra de endereco, e quem faz a troca por tokens e a API, nao
          o navegador.
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Se a URI abriu normalmente, o callback <strong>ja consumiu</strong> o <code>state</code>:
          colar a URL aqui devolve <em>&ldquo;autorizacao invalida ou expirada&rdquo;</em> mesmo com
          a autorizacao tendo dado certo. Confira o cartao de situacao no topo antes.
        </p>
        <CreateForm
          action={completeAuthorization}
          submitLabel="Concluir autorizacao"
          fields={[
            {
              kind: 'input',
              name: 'returnUrl',
              label: 'URL de retorno',
              type: 'text',
              required: true,
              placeholder: 'https://seu-host/auth/mercado-livre/callback?code=TG-...&state=...',
            },
          ]}
        />
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          O <code>code</code> e de uso unico e expira junto com o link de autorizacao.
        </p>
      </details>
    </div>
  );
}
