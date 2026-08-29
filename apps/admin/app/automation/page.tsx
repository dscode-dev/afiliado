import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Empty, formatDate } from '@/components/ui';
import { getOne } from '@/lib/api';
import { AutomationStatus } from '@/lib/types';
import { runCycleNow } from './actions';

export const dynamic = 'force-dynamic';

const DEFERRED_LABELS: Record<string, string> = {
  autopilot_disabled: 'Autopilot desligado',
  outside_publish_window: 'Fora da janela de horario',
  channel_limit_reached: 'Limite do canal atingido',
};

export default async function AutomationPage() {
  const status = await getOne<AutomationStatus>('/automation/status');
  const last = status.lastResult;

  return (
    <div>
      <header>
        <h2>Automacao</h2>
        <p>
          Executa o pipeline Mercado Livre → Opportunity Engine → Telegram. A configuracao vem do
          ambiente e nao e editavel por aqui.
        </p>
      </header>

      <div className="metrics">
        <div className="metric">
          <div className="value">
            <span className={`badge ${status.autopilotEnabled ? 'approved' : 'rejected'}`}>
              {status.autopilotEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="label">Autopilot</div>
        </div>
        <div className="metric">
          <div className="value" style={{ fontSize: 15 }}>
            {status.running ? `rodando (${status.runningPhase})` : 'ocioso'}
          </div>
          <div className="label">Estado</div>
        </div>
        <div className="metric">
          <div className="value" style={{ fontSize: 15 }}>
            {formatDate(status.lastRunAt)}
          </div>
          <div className="label">Ultima execucao</div>
        </div>
        <div className="metric">
          <div className="value" style={{ fontSize: 15 }}>
            {status.schedulerEnabled ? formatDate(status.nextRunAt.distribution) : 'scheduler off'}
          </div>
          <div className="label">Proxima distribuicao</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Executar agora</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Roda o mesmo ciclo do scheduler: sincroniza, atualiza popularidade, avalia e distribui.
          {!status.autopilotEnabled ? (
            <>
              {' '}
              Com o autopilot <strong>OFF</strong>, nada e publicado — as oportunidades ficam
              apenas listadas como adiadas.
            </>
          ) : null}
        </p>
        <ActionForm action={runCycleNow} label="Executar agora" pendingLabel="Executando..." />
      </div>

      <div className="card">
        <h3>Politica de publicacao</h3>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr>
                <td>Score minimo</td>
                <td className="num">{status.limits.minScore}</td>
              </tr>
              <tr>
                <td>Maximo por hora / por dia</td>
                <td className="num">
                  {status.limits.maxPostsPerHour} / {status.limits.maxPostsPerDay}
                </td>
              </tr>
              <tr>
                <td>Idade maxima da oferta</td>
                <td className="num">{status.limits.maxOfferAgeHours}h</td>
              </tr>
              <tr>
                <td>Janela de publicacao</td>
                <td className="num">
                  {status.limits.publishWindow} ({status.limits.timezone}){' '}
                  <span className={`badge ${status.limits.withinPublishWindow ? 'approved' : ''}`}>
                    {status.limits.withinPublishWindow ? 'aberta' : 'fechada'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Ultimo resultado</h3>
        {!last ? (
          <Empty>Nenhum ciclo executado desde que a aplicacao subiu.</Empty>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              {formatDate(last.startedAt)} · {(last.durationMs / 1000).toFixed(1)}s ·{' '}
              {last.phases.join(' → ')}
            </p>
            <div className="metrics">
              <Metric label="Sincronizados" value={last.productRefresh?.synced ?? 0} />
              <Metric label="Avaliados" value={last.evaluation?.evaluated ?? 0} />
              <Metric label="Aprovados" value={last.evaluation?.approved ?? 0} />
              <Metric label="Publicados" value={last.distribution?.published ?? 0} />
              <Metric label="Adiados" value={last.distribution?.deferred ?? 0} />
              <Metric
                label="Falhas"
                value={
                  (last.productRefresh?.syncFailed ?? 0) +
                  (last.evaluation?.evaluationFailed ?? 0) +
                  (last.distribution?.publishFailed ?? 0)
                }
              />
            </div>

            {last.distribution?.deferredReason ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Motivo do adiamento:{' '}
                {DEFERRED_LABELS[last.distribution.deferredReason] ??
                  last.distribution.deferredReason}
              </p>
            ) : null}

            {last.phaseFailures.length > 0 ? (
              <div className="error">
                {last.phaseFailures.map((failure) => (
                  <div key={failure.phase}>
                    {failure.phase}: {failure.reason}
                  </div>
                ))}
              </div>
            ) : null}

            {last.distribution && last.distribution.channels.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Canal</th>
                      <th>Publicados</th>
                      <th>Adiados</th>
                      <th>Cota restante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last.distribution.channels.map((channel) => (
                      <tr key={channel.channelId}>
                        <td>{channel.channelName}</td>
                        <td className="num">{channel.published}</td>
                        <td className="num">{channel.deferred}</td>
                        <td className="num">{channel.remainingQuota}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Resultado mantido em memoria: reiniciar a aplicacao zera este painel. Ver{' '}
          <Link href="/publications">Publicacoes</Link> para o historico persistido.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
