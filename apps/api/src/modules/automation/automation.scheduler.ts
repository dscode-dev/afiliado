import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AutomationConfig } from './automation.config';
import { AutomationOrchestrator } from './automation.orchestrator';

const MINUTE_MS = 60_000;

/**
 * Agendador in-process, com `setInterval` puro - sem worker separado, fila,
 * broker ou dependencia de scheduling.
 *
 * PREMISSA: a V1 roda em INSTANCIA UNICA. A trava contra execucoes
 * simultaneas vive em memoria, entao multiplas replicas exigiriam coordenacao
 * distribuida - fora de escopo por decisao.
 *
 * Os jobs apenas delegam ao orchestrator: nao ha logica de negocio aqui.
 */
@Injectable()
export class AutomationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AutomationScheduler');
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly config: AutomationConfig,
    private readonly orchestrator: AutomationOrchestrator,
  ) {}

  onModuleInit(): void {
    if (!this.config.schedulerEnabled) {
      this.logger.log(
        JSON.stringify({ event: 'automation_scheduler_disabled', reason: 'configuration' }),
      );
      return;
    }

    this.register('productRefresh', this.config.productRefreshIntervalMinutes, () =>
      this.runProductRefreshJob(),
    );
    this.register('evaluation', this.config.evaluationIntervalMinutes, () =>
      this.runEvaluationJob(),
    );
    this.register('distribution', this.config.distributionIntervalMinutes, () =>
      this.runDistributionJob(),
    );
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  /** Jobs expostos para que possam ser exercitados sem timers reais. */
  runProductRefreshJob(): Promise<void> {
    return this.safely('productRefresh', () => this.orchestrator.runProductRefresh());
  }

  runEvaluationJob(): Promise<void> {
    return this.safely('evaluation', () => this.orchestrator.runEvaluation());
  }

  runDistributionJob(): Promise<void> {
    return this.safely('distribution', () => this.orchestrator.runDistribution());
  }

  private register(name: string, minutes: number, job: () => Promise<void>): void {
    const timer = setInterval(() => void job(), minutes * MINUTE_MS);

    // `unref` para que um job agendado nunca segure o processo vivo.
    timer.unref();
    this.timers.set(name, timer);

    this.logger.log(
      JSON.stringify({ event: 'automation_job_registered', job: name, intervalMinutes: minutes }),
    );
  }

  /**
   * Um job nunca derruba o processo. Ciclo sobreposto (409) e situacao
   * esperada e sai como aviso, nao como erro.
   */
  private async safely(name: string, execute: () => Promise<unknown>): Promise<void> {
    try {
      await execute();
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'automation_job_skipped',
          job: name,
          reason: error instanceof Error ? error.message : 'Erro inesperado',
        }),
      );
    }
  }
}
