import { Injectable } from '@nestjs/common';

/**
 * Configuracao da autenticacao administrativa.
 *
 * Nao ha segredo criptografico proprio: o token de sessao e aleatorio de alta
 * entropia e guardado como hash, entao nao existe nada para assinar ou
 * derivar. Menos um secret para vazar.
 */
@Injectable()
export class AuthConfig {
  readonly sessionTtlHours: number;
  readonly maxLoginAttempts: number;
  readonly loginWindowMinutes: number;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.sessionTtlHours = readNumber(env.ADMIN_SESSION_TTL_HOURS, 12, 1);
    this.maxLoginAttempts = readNumber(env.ADMIN_LOGIN_MAX_ATTEMPTS, 5, 1);
    this.loginWindowMinutes = readNumber(env.ADMIN_LOGIN_WINDOW_MINUTES, 15, 1);
  }

  get sessionTtlMs(): number {
    return this.sessionTtlHours * 3_600_000;
  }

  get loginWindowMs(): number {
    return this.loginWindowMinutes * 60_000;
  }
}

function readNumber(raw: string | undefined, fallback: number, min: number): number {
  const value = Number(raw);

  return Number.isFinite(value) && value >= min ? value : fallback;
}
