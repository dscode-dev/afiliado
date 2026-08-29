import { Injectable } from '@nestjs/common';

/**
 * Fonte de tempo injetavel.
 *
 * Existe para que os testes de janela de horario, limites por hora/dia e idade
 * de oferta sejam deterministicos, sem depender de timers reais.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}

/** Relogio fixo, usado apenas nos testes. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(next: Date): void {
    this.current = next;
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}
