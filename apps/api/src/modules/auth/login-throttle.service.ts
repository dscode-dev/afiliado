import { Injectable } from '@nestjs/common';
import { AuthConfig } from './auth.config';

interface Attempts {
  count: number;
  firstAt: number;
}

/**
 * Freio de forca bruta no login.
 *
 * Contador em memoria por email+IP, com janela deslizante. A V1 roda em
 * INSTANCIA UNICA, entao isso basta; multiplas replicas exigiriam storage
 * compartilhado (ver README).
 *
 * Nao bloqueia a conta permanentemente: a janela expira sozinha.
 */
@Injectable()
export class LoginThrottleService {
  private readonly attempts = new Map<string, Attempts>();

  constructor(private readonly config: AuthConfig) {}

  private key(email: string, ip: string): string {
    return `${email.toLowerCase()}|${ip}`;
  }

  /** Segundos restantes de bloqueio, ou 0 quando ainda ha tentativas. */
  retryAfterSeconds(email: string, ip: string, now = Date.now()): number {
    const entry = this.attempts.get(this.key(email, ip));

    if (!entry) return 0;

    const elapsed = now - entry.firstAt;
    if (elapsed >= this.config.loginWindowMs) return 0;
    if (entry.count < this.config.maxLoginAttempts) return 0;

    return Math.ceil((this.config.loginWindowMs - elapsed) / 1000);
  }

  registerFailure(email: string, ip: string, now = Date.now()): void {
    const key = this.key(email, ip);
    const entry = this.attempts.get(key);

    if (!entry || now - entry.firstAt >= this.config.loginWindowMs) {
      this.attempts.set(key, { count: 1, firstAt: now });
      return;
    }

    entry.count += 1;
  }

  /** Login bem-sucedido zera o contador daquele par. */
  clear(email: string, ip: string): void {
    this.attempts.delete(this.key(email, ip));
  }
}
