import Link from 'next/link';
import { CreateForm } from '@/components/create-form';
import { Field } from '@/components/form-state';
import { RowActionForm } from '@/components/row-action-form';
import { ScoreBreakdown } from '@/components/score-breakdown';
import { Empty, formatDate, formatMoney } from '@/components/ui';
import { ManualPublish, ManualPreviewData } from '@/components/manual-publish';
import { PublishForm } from '@/components/publish-form';
import { ApiError, getList, getOne } from '@/lib/api';
import { Channel, ManualPreview, Opportunity, Publication } from '@/lib/types';
import {
  addLinkAndReevaluate,
  clearDecision,
  confirmManualPublication,
  decide,
  evaluateProduct,
  publishOpportunity,
} from './actions';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'APPROVED', label: 'Aprovadas' },
  { value: 'CANDIDATE', label: 'Candidatas' },
  { value: 'IGNORE', label: 'Ignoradas' },
  { value: 'NOT_ELIGIBLE', label: 'Sem link' },
];

/** Tipos com publicacao automatica oficial. */
const PUBLISHABLE_TYPES: string[] = ['TELEGRAM', 'FACEBOOK'];
/** Tipos sem API oficial: fluxo semiassistido. */
const MANUAL_TYPES: string[] = ['WHATSAPP'];

const BADGE_CLASS: Record<string, string> = {
  APPROVED: 'approved',
  CANDIDATE: 'candidate',
  REJECTED: 'rejected',
  NOT_ELIGIBLE: 'required',
};

function linkFields(productId: string): Field[] {
  return [
    { kind: 'input', name: 'productId', label: 'productId', type: 'hidden', value: productId },
    {
      kind: 'input',
      name: 'url',
      label: 'URL de afiliado',
      type: 'url',
      required: true,
      placeholder: 'https://mercadolivre.com/sec/...',
    },
    { kind: 'input', name: 'sourceLabel', label: 'Origem', type: 'text', placeholder: 'painel-afiliados' },
  ];
}

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; minScore?: string; category?: string }>;
}) {
  const filters = await searchParams;

  const query = new URLSearchParams({ take: '100' });
  if (filters.status) query.set('status', filters.status);
  if (filters.minScore) query.set('minScore', filters.minScore);
  if (filters.category) query.set('category', filters.category);

  const [opportunities, channels, publications] = await Promise.all([
    getList<Opportunity>(`/opportunities?${query.toString()}`),
    // Todos os destinos ativos, nao apenas Telegram.
    getList<Channel>('/channels?active=true&take=50'),
    // take=100 e o maximo aceito pela API; o painel lista ate 100 oportunidades.
    getList<Publication>('/publications?take=100'),
  ]);

  // Publicacoes ja registradas por oferta, para mostrar o estado em vez do botao.
  const publishedByOffer = new Map<string, Publication[]>();
  for (const publication of publications.data) {
    const list = publishedByOffer.get(publication.offerId) ?? [];
    list.push(publication);
    publishedByOffer.set(publication.offerId, list);
  }

  const manualChannels = channels.data.filter((channel) => MANUAL_TYPES.includes(channel.type));

  /**
   * Previews dos canais manuais das oportunidades publicaveis.
   * Gerados no servidor para que o operador possa copiar sem mais um clique;
   * um preview que falhe (ex.: link removido) simplesmente nao aparece.
   */
  const previewsByOffer = new Map<string, ManualPreviewData[]>();
  await Promise.all(
    opportunities.data
      .filter((opportunity) => opportunity.effectiveStatus === 'APPROVED' && opportunity.offerId)
      .flatMap((opportunity) =>
        manualChannels.map(async (channel) => {
          try {
            const preview = await getOne<ManualPreview>(
              `/offers/${opportunity.offerId}/manual-preview?channelId=${channel.id}`,
            );
            const list = previewsByOffer.get(opportunity.offerId as string) ?? [];
            list.push({
              channelId: preview.channelId,
              text: preview.text,
              affiliateUrl: preview.affiliateUrl,
              imageUrl: preview.imageUrl,
              alreadyPublished: preview.alreadyPublished,
            });
            previewsByOffer.set(opportunity.offerId as string, list);
          } catch (error) {
            if (!(error instanceof ApiError)) throw error;
          }
        }),
      ),
  );

  return (
    <div>
      <header>
        <h2>Oportunidades</h2>
        <p>
          Score do engine e decisao do operador, lado a lado. Oportunidades aprovadas podem ser
          publicadas no Telegram e no Facebook, e preparadas para o WhatsApp.
        </p>
      </header>

      <div className="card">
        <h3>Filtros</h3>
        <form method="GET" action="/opportunities">
          <div className="form-grid">
            <div>
              <label htmlFor="status">Status do engine</label>
              <select id="status" name="status" defaultValue={filters.status ?? ''}>
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="minScore">Score minimo</label>
              <input
                id="minScore"
                name="minScore"
                type="number"
                min="0"
                max="100"
                defaultValue={filters.minScore ?? ''}
              />
            </div>
            <div>
              <label htmlFor="category">Categoria</label>
              <input
                id="category"
                name="category"
                type="text"
                defaultValue={filters.category ?? ''}
              />
            </div>
            <div>
              <button type="submit">Filtrar</button>
            </div>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>Avaliadas ({opportunities.total})</h3>
        {opportunities.data.length === 0 ? (
          <Empty>
            Nenhuma avaliacao ainda. Use <Link href="/products">Avaliar ativos</Link> em Produtos.
          </Empty>
        ) : (
          opportunities.data.map((opportunity) => (
            <OpportunityRow
              key={opportunity.productId}
              opportunity={opportunity}
              publishableChannels={channels.data.filter((channel) =>
                PUBLISHABLE_TYPES.includes(channel.type),
              )}
              publications={
                opportunity.offerId ? (publishedByOffer.get(opportunity.offerId) ?? []) : []
              }
              manualChannels={manualChannels}
              manualPreviews={
                opportunity.offerId ? (previewsByOffer.get(opportunity.offerId) ?? []) : []
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function OpportunityRow({
  opportunity,
  publishableChannels,
  publications,
  manualChannels,
  manualPreviews,
}: {
  opportunity: Opportunity;
  publishableChannels: Channel[];
  publications: Publication[];
  manualChannels: Channel[];
  manualPreviews: ManualPreviewData[];
}) {
  const effective = opportunity.effectiveStatus;
  const publishable = effective === 'APPROVED' && opportunity.offerId !== null;
  const publishedChannelIds = new Set(
    publications.filter((p) => p.status === 'PUBLISHED').map((p) => p.channelId),
  );
  const pendingChannels = publishableChannels.filter(
    (channel) => !publishedChannelIds.has(channel.id),
  );

  return (
    <details className="opportunity">
      <summary>
        <span className="score-cell">{opportunity.score}</span>
        <span className={`badge ${BADGE_CLASS[opportunity.status] ?? ''}`}>
          {opportunity.status}
        </span>
        {effective !== opportunity.status ? (
          <span className={`badge ${BADGE_CLASS[effective] ?? ''}`}>operador: {effective}</span>
        ) : null}
        <span className="title">{opportunity.title}</span>
        <span>{formatMoney(opportunity.price)}</span>
        {opportunity.hasActiveAffiliateLink ? (
          <span className="badge">link ok</span>
        ) : (
          <span className="badge required">LINK REQUIRED</span>
        )}
        <span className="muted">{formatDate(opportunity.evaluatedAt)}</span>
      </summary>

      <ScoreBreakdown
        breakdown={opportunity.breakdown}
        score={opportunity.score}
        reasons={opportunity.reasons}
      />

      <div className="row-actions" style={{ marginTop: 8 }}>
        <RowActionForm
          action={evaluateProduct}
          id={opportunity.productId}
          values={{}}
          label="Avaliar"
        />
        <RowActionForm
          action={decide}
          id={opportunity.productId}
          values={{ decision: 'APPROVED' }}
          label="Aprovar manualmente"
        />
        <RowActionForm
          action={decide}
          id={opportunity.productId}
          values={{ decision: 'REJECTED' }}
          label="Rejeitar"
        />
        {opportunity.operatorDecision ? (
          <RowActionForm
            action={clearDecision}
            id={opportunity.productId}
            values={{}}
            label="Voltar ao engine"
          />
        ) : null}
        <Link className="badge" href={`/products/${opportunity.productId}/prices`}>
          Historico
        </Link>
        {opportunity.permalink ? (
          <a className="badge" href={opportunity.permalink} target="_blank" rel="noreferrer noopener">
            Ver no ML
          </a>
        ) : null}
      </div>

      {publications.length > 0 ? (
        <ul className="published-list">
          {publications.map((publication) => (
            <li key={publication.id}>
              <span className={`badge ${publication.status === 'PUBLISHED' ? 'approved' : 'rejected'}`}>
                {publication.status === 'PUBLISHED' ? 'Publicado' : publication.status}
              </span>
              <span>
                {publication.channel
                  ? `${publication.channel.type} — ${publication.channel.name}`
                  : publication.channelId}
              </span>
              <span className="muted">{formatDate(publication.publishedAt)}</span>
              {publication.status === 'FAILED' ? (
                <Link className="badge" href="/publications">
                  Reenviar
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {publishable && pendingChannels.length > 0 ? (
        <div className="publish-box">
          <strong style={{ fontSize: 13 }}>Publicar</strong>
          <PublishForm
            action={publishOpportunity}
            offerId={opportunity.offerId as string}
            channels={pendingChannels.map((channel) => ({
              id: channel.id,
              name: `${channel.type} — ${channel.name}`,
            }))}
          />
        </div>
      ) : null}

      {publishable && manualChannels.length > 0 && manualPreviews.length > 0 ? (
        <ManualPublish
          offerId={opportunity.offerId as string}
          channels={manualChannels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            provider: channel.type,
          }))}
          previews={manualPreviews}
          confirmAction={confirmManualPublication}
        />
      ) : null}

      {publishable && publishableChannels.length === 0 && manualChannels.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Nenhum canal ativo. Cadastre um em <Link href="/channels">Canais</Link>.
        </p>
      ) : null}

      {publishable && publishableChannels.length === 0 && manualChannels.length > 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Nenhum canal com publicacao automatica. Cadastre um Telegram ou Facebook em{' '}
          <Link href="/channels">Canais</Link>.
        </p>
      ) : null}

      {opportunity.operatorNote ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Nota do operador: {opportunity.operatorNote}
        </p>
      ) : null}

      {!opportunity.hasActiveAffiliateLink ? (
        <div className="link-required-form">
          <strong style={{ fontSize: 13 }}>
            Cadastre o link de afiliado para tornar esta oportunidade elegivel
          </strong>
          <CreateForm
            action={addLinkAndReevaluate}
            fields={linkFields(opportunity.productId)}
            submitLabel="Cadastrar e reavaliar"
          />
        </div>
      ) : null}
    </details>
  );
}
