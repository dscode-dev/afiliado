import { Injectable } from '@nestjs/common';
import { CycleSummary } from './automation.types';

/**
 * Estado do autopilot, mantido em memoria.
 *
 * Nao e persistido de proposito: e informacao operacional do processo atual, e
 * a V1 roda em instancia unica. Persistir aqui so pareceria robusto.
 */
@Injectable()
export class AutomationState {
  private locked = false;
  private phase: string | null = null;
  private lastRun: Date | null = null;
  private lastSummary: CycleSummary | null = null;
  private readonly lastRunByJob = new Map<string, Date>();

  get running(): boolean {
    return this.locked;
  }

  get runningPhase(): string | null {
    return this.phase;
  }

  get lastRunAt(): Date | null {
    return this.lastRun;
  }

  get lastResult(): CycleSummary | null {
    return this.lastSummary;
  }

  lastRunOf(job: string): Date | null {
    return this.lastRunByJob.get(job) ?? null;
  }

  /**
   * Trava global do autopilot: enquanto um ciclo roda, qualquer outra execucao
   * e ignorada. Uma unica instancia, entao um flag em memoria basta.
   *
   * Retorna `null` quando ja havia execucao em andamento.
   */
  tryAcquire(phase: string): (() => void) | null {
    if (this.locked) return null;

    this.locked = true;
    this.phase = phase;

    return () => {
      this.locked = false;
      this.phase = null;
      this.lastRunByJob.set(phase, new Date());
    };
  }

  record(summary: CycleSummary): void {
    this.lastRun = new Date(summary.finishedAt);
    this.lastSummary = summary;
  }
}
