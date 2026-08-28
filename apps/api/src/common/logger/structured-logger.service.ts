import { ConsoleLogger, Injectable, LogLevel, Scope } from '@nestjs/common';

const LEVEL_ORDER: Record<string, number> = {
  debug: 10,
  verbose: 10,
  log: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

function minimumLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? 'log').toLowerCase();
  return LEVEL_ORDER[configured] ?? LEVEL_ORDER.log;
}

/**
 * Logger estruturado (JSON por linha) com o minimo necessario:
 * timestamp, nivel, contexto, mensagem e erro.
 *
 * Nao substitui uma stack de observabilidade - e apenas saida previsivel
 * e parseavel para stdout.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class StructuredLogger extends ConsoleLogger {
  private write(level: LogLevel, message: unknown, context?: string, stack?: string): void {
    if ((LEVEL_ORDER[level] ?? 0) < minimumLevel()) {
      return;
    }

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      context: context ?? this.context ?? 'Application',
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };

    if (stack) {
      entry.stack = stack;
    }

    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  log(message: unknown, context?: string): void {
    this.write('log', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context);
  }
}
