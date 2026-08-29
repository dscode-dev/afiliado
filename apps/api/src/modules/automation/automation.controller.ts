import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { AutomationConfig } from './automation.config';
import { AutomationOrchestrator } from './automation.orchestrator';
import { AutomationState } from './automation.state';
import { AutomationStatus, CycleSummary, ProviderStatus } from './automation.types';
import { Clock } from './clock';

@Controller('automation')
export class AutomationController {
  constructor(
    private readonly orchestrator: AutomationOrchestrator,
    private readonly state: AutomationState,
    private readonly config: AutomationConfig,
    private readonly clock: Clock,
  ) {}

  /** Executa agora o mesmo pipeline que o scheduler executa. */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(): Promise<CycleSummary> {
    return this.orchestrator.runFullCycle();
  }

  @Get('status')
  status(): AutomationStatus {
    const now = this.clock.now();

    return {
      autopilotEnabled: this.config.anyAutoPublishEnabled,
      providers: this.providerStatuses(),
      schedulerEnabled: this.config.schedulerEnabled,
      running: this.state.running,
      runningPhase: this.state.runningPhase,
      lastRunAt: this.state.lastRunAt?.toISOString() ?? null,
      lastResult: this.state.lastResult,
      nextRunAt: {
        productRefresh: this.nextRun('productRefresh', this.config.productRefreshIntervalMinutes),
        evaluation: this.nextRun('evaluation', this.config.evaluationIntervalMinutes),
        distribution: this.nextRun('distribution', this.config.distributionIntervalMinutes),
      },
      limits: {
        maxOfferAgeHours: this.config.maxOfferAgeHours,
        publishWindow: `${this.config.publishStartHour}h-${this.config.publishEndHour}h`,
        timezone: this.config.timezone,
        withinPublishWindow: this.config.isWithinPublishWindow(now),
      },
    };
  }

  /** Um destino por linha: o operador precisa ver quem esta ligado. */
  private providerStatuses(): ProviderStatus[] {
    return [ChannelType.TELEGRAM, ChannelType.FACEBOOK].map((provider) => {
      const policy = this.config.policyFor(provider);

      return {
        provider,
        autopilotEnabled: policy.enabled,
        minScore: policy.minScore,
        maxPostsPerHour: policy.maxPostsPerHour,
        maxPostsPerDay: policy.maxPostsPerDay,
      };
    });
  }

  /** Estimativa a partir da ultima execucao; null enquanto o job nunca rodou. */
  private nextRun(job: string, intervalMinutes: number): string | null {
    if (!this.config.schedulerEnabled) return null;

    const last = this.state.lastRunOf(job);
    if (!last) return null;

    return new Date(last.getTime() + intervalMinutes * 60_000).toISOString();
  }
}
