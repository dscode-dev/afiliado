import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PopularityService } from '../catalog/popularity.service';
import { ProductSyncService } from '../catalog/product-sync.service';
import { OpportunityService } from '../opportunity/opportunity.service';
import { TelegramPublisherService } from '../distribution/telegram/telegram-publisher.service';
import { AutomationConfig } from './automation.config';
import { AutomationState } from './automation.state';
import { Clock } from './clock';
import { DistributionPolicyService } from './distribution-policy.service';
import {
  CycleSummary,
  DistributionSummary,
  EvaluationSummary,
  ProductRefreshSummary,
} from './automation.types';

export type Phase = 'productRefresh' | 'evaluation' | 'distribution' | 'fullCycle';

/**
 * Orquestrador unico do pipeline automatico.
 *
 * Reutiliza integralmente os services dos PRs anteriores - nenhuma regra de
 * negocio e reimplementada aqui. O scheduler e o `POST /automation/run` chamam
 * exatamente estes mesmos metodos.
 */
@Injectable()
export class AutomationOrchestrator {
  private readonly logger = new Logger('Automation');

  constructor(
    private readonly config: AutomationConfig,
    private readonly state: AutomationState,
    private readonly clock: Clock,
    private readonly sync: ProductSyncService,
    private readonly popularity: PopularityService,
    private readonly opportunities: OpportunityService,
    private readonly policy: DistributionPolicyService,
    private readonly publisher: TelegramPublisherService,
  ) {}

  /** Ciclo completo: usado pelo `POST /automation/run`. */
  runFullCycle(): Promise<CycleSummary> {
    return this.run('fullCycle', ['productRefresh', 'evaluation', 'distribution']);
  }

  runProductRefresh(): Promise<CycleSummary> {
    return this.run('productRefresh', ['productRefresh']);
  }

  runEvaluation(): Promise<CycleSummary> {
    return this.run('evaluation', ['evaluation']);
  }

  runDistribution(): Promise<CycleSummary> {
    return this.run('distribution', ['distribution']);
  }

  /**
   * Executa as fases pedidas sob a trava global.
   *
   * A falha de uma fase e registrada em `phaseFailures` e nao impede as demais:
   * uma indisponibilidade do Mercado Livre nao pode travar a distribuicao do
   * que ja foi avaliado.
   */
  private async run(phase: Phase, steps: Phase[]): Promise<CycleSummary> {
    const release = this.state.tryAcquire(phase);

    if (!release) {
      this.logger.warn(
        JSON.stringify({
          event: 'automation_cycle_skipped',
          phase,
          reason: 'already_running',
          runningPhase: this.state.runningPhase,
        }),
      );

      throw new ConflictException(
        `Ja existe um ciclo de automacao em execucao (${this.state.runningPhase})`,
      );
    }

    const startedAt = this.clock.now();
    this.logger.log(JSON.stringify({ event: 'automation_cycle_started', phase, steps }));

    const summary: CycleSummary = {
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      durationMs: 0,
      phases: steps,
      productRefresh: null,
      evaluation: null,
      distribution: null,
      phaseFailures: [],
    };

    try {
      if (steps.includes('productRefresh')) {
        summary.productRefresh = await this.guard('productRefresh', summary, () =>
          this.executeProductRefresh(),
        );
      }

      if (steps.includes('evaluation')) {
        summary.evaluation = await this.guard('evaluation', summary, () =>
          this.executeEvaluation(),
        );
      }

      if (steps.includes('distribution')) {
        summary.distribution = await this.guard('distribution', summary, () =>
          this.executeDistribution(),
        );
      }
    } finally {
      const finishedAt = this.clock.now();
      summary.finishedAt = finishedAt.toISOString();
      summary.durationMs = finishedAt.getTime() - startedAt.getTime();

      this.state.record(summary);
      release();

      this.logger.log(
        JSON.stringify({
          event: 'automation_cycle_finished',
          phase,
          durationMs: summary.durationMs,
          counts: countsOf(summary),
          failures: summary.phaseFailures.length,
        }),
      );
    }

    return summary;
  }

  /** Isola a falha de uma fase para que o ciclo continue. */
  private async guard<T>(
    phase: string,
    summary: CycleSummary,
    execute: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await execute();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Erro inesperado';
      summary.phaseFailures.push({ phase, reason });

      this.logger.error(JSON.stringify({ event: 'automation_phase_failed', phase, reason }));

      return null;
    }
  }

  private async executeProductRefresh(): Promise<ProductRefreshSummary> {
    const syncReport = await this.sync.syncActive();
    this.logger.log(
      JSON.stringify({
        event: 'product_sync_completed',
        counts: {
          total: syncReport.total,
          synced: syncReport.synced,
          unchanged: syncReport.unchanged,
          failed: syncReport.failed,
        },
      }),
    );

    // Popularidade e enriquecimento: se falhar, o sync ja feito continua valendo.
    let popularityChecked = 0;
    let popularityRanked = 0;
    let popularityFailedCategories = 0;

    try {
      const report = await this.popularity.refreshActive();
      popularityChecked = report.productsChecked;
      popularityRanked = report.productsRanked;
      popularityFailedCategories = report.failedCategories.length;

      this.logger.log(
        JSON.stringify({
          event: 'popularity_refresh_completed',
          counts: {
            categories: report.categories,
            checked: report.productsChecked,
            ranked: report.productsRanked,
          },
          failures: report.failedCategories.length,
        }),
      );
    } catch (error) {
      popularityFailedCategories = -1;
      this.logger.error(
        JSON.stringify({
          event: 'popularity_refresh_failed',
          reason: error instanceof Error ? error.message : 'Erro inesperado',
        }),
      );
    }

    return {
      synced: syncReport.synced,
      syncUnchanged: syncReport.unchanged,
      syncFailed: syncReport.failed,
      popularityChecked,
      popularityRanked,
      popularityFailedCategories,
    };
  }

  private async executeEvaluation(): Promise<EvaluationSummary> {
    const report = await this.opportunities.evaluateActive(this.clock.now());

    this.logger.log(
      JSON.stringify({
        event: 'evaluation_completed',
        counts: {
          total: report.total,
          approved: report.approved,
          candidate: report.candidate,
          ignored: report.ignored,
          notEligible: report.notEligible,
        },
        failures: report.failed,
      }),
    );

    return {
      evaluated: report.total,
      approved: report.approved,
      candidate: report.candidate,
      ignored: report.ignored,
      notEligible: report.notEligible,
      evaluationFailed: report.failed,
    };
  }

  /**
   * Seleciona as melhores oportunidades e publica respeitando os limites.
   *
   * Publicacao sequencial de proposito: volume baixo e previsibilidade valem
   * mais que paralelismo aqui.
   */
  private async executeDistribution(): Promise<DistributionSummary> {
    const summary: DistributionSummary = {
      eligible: 0,
      published: 0,
      publishFailed: 0,
      deferred: 0,
      deferredReason: null,
      channels: [],
      failures: [],
    };

    const candidates = await this.policy.selectCandidates();
    summary.eligible = candidates.length;

    // Autopilot desligado: o ciclo continua, so a publicacao fica pausada.
    if (!this.config.autoPublishEnabled) {
      summary.deferred = candidates.length;
      summary.deferredReason = 'autopilot_disabled';
      this.logDistribution(summary);
      return summary;
    }

    if (!this.config.isWithinPublishWindow(this.clock.now())) {
      summary.deferred = candidates.length;
      summary.deferredReason = 'outside_publish_window';
      this.logDistribution(summary);
      return summary;
    }

    const channels = await this.policy.activeTelegramChannels();

    for (const channel of channels) {
      const quota = await this.policy.quotaFor(channel.id, channel.name);
      const alreadyPublished = await this.policy.alreadyPublishedOfferIds(
        channel.id,
        candidates.map((candidate) => candidate.offerId),
      );

      const pending = candidates.filter((candidate) => !alreadyPublished.has(candidate.offerId));
      let published = 0;

      for (const candidate of pending) {
        if (published >= quota.remaining) {
          summary.deferred += 1;
          summary.deferredReason ??= 'channel_limit_reached';
          continue;
        }

        try {
          await this.publisher.publish(candidate.offerId, channel.id);
          published += 1;
          summary.published += 1;
        } catch (error) {
          // Uma publicacao com problema nao impede as demais.
          summary.publishFailed += 1;
          summary.failures.push({
            offerId: candidate.offerId,
            channelId: channel.id,
            reason: error instanceof Error ? error.message : 'Erro inesperado',
          });
        }
      }

      summary.channels.push({
        channelId: channel.id,
        channelName: channel.name,
        published,
        deferred: Math.max(0, pending.length - published),
        remainingQuota: Math.max(0, quota.remaining - published),
      });
    }

    this.logDistribution(summary);
    return summary;
  }

  private logDistribution(summary: DistributionSummary): void {
    this.logger.log(
      JSON.stringify({
        event: 'telegram_distribution_completed',
        counts: {
          eligible: summary.eligible,
          published: summary.published,
          deferred: summary.deferred,
        },
        deferredReason: summary.deferredReason,
        failures: summary.publishFailed,
      }),
    );
  }
}

function countsOf(summary: CycleSummary): Record<string, number> {
  return {
    synced: summary.productRefresh?.synced ?? 0,
    syncFailed: summary.productRefresh?.syncFailed ?? 0,
    evaluated: summary.evaluation?.evaluated ?? 0,
    approved: summary.evaluation?.approved ?? 0,
    published: summary.distribution?.published ?? 0,
    publishFailed: summary.distribution?.publishFailed ?? 0,
    deferred: summary.distribution?.deferred ?? 0,
  };
}
