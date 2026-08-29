import { Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';

/**
 * Configuracao do autopilot, lida de environment variables.
 *
 * Toda configuracao vive no ambiente - o painel nunca edita estes valores.
 * Os defaults sao conservadores de proposito: subir a aplicacao nunca publica
 * nada sozinho.
 */
@Injectable()
export class AutomationConfig {
  /** Liga os jobs agendados. O ciclo manual funciona mesmo com isto desligado. */
  readonly schedulerEnabled: boolean;
  readonly productRefreshIntervalMinutes: number;
  readonly evaluationIntervalMinutes: number;
  readonly distributionIntervalMinutes: number;

  /**
   * Politica de publicacao por provider.
   *
   * Default de `enabled` e FALSE em todos: cada destino e opt-in
   * independente, mesmo com a integracao totalmente configurada.
   */
  readonly providers: Record<ChannelType, ProviderPolicy>;
  readonly maxOfferAgeHours: number;

  /** Janela de publicacao [start, end) na timezone da aplicacao. */
  readonly publishStartHour: number;
  readonly publishEndHour: number;
  readonly timezone: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.schedulerEnabled = readBoolean(env.AUTOMATION_SCHEDULER_ENABLED, true);
    this.productRefreshIntervalMinutes = readNumber(env.PRODUCT_REFRESH_INTERVAL_MINUTES, 60, 1);
    this.evaluationIntervalMinutes = readNumber(env.OPPORTUNITY_EVALUATION_INTERVAL_MINUTES, 30, 1);
    this.distributionIntervalMinutes = readNumber(env.TELEGRAM_DISTRIBUTION_INTERVAL_MINUTES, 15, 1);

    this.providers = {
      TELEGRAM: {
        enabled: readBoolean(env.TELEGRAM_AUTO_PUBLISH_ENABLED, false),
        maxPostsPerHour: readNumber(env.TELEGRAM_MAX_POSTS_PER_HOUR, 2, 0),
        maxPostsPerDay: readNumber(env.TELEGRAM_MAX_POSTS_PER_DAY, 12, 0),
        minScore: readNumber(env.TELEGRAM_MIN_SCORE, 85, 0),
      },
      FACEBOOK: {
        enabled: readBoolean(env.FACEBOOK_AUTO_PUBLISH_ENABLED, false),
        // Feed de Page tolera menos volume que canal de Telegram.
        maxPostsPerHour: readNumber(env.FACEBOOK_MAX_POSTS_PER_HOUR, 1, 0),
        maxPostsPerDay: readNumber(env.FACEBOOK_MAX_POSTS_PER_DAY, 6, 0),
        minScore: readNumber(env.FACEBOOK_MIN_SCORE, 85, 0),
      },
      // Sem publisher nesta versao: nunca elegivel.
      WHATSAPP: { enabled: false, maxPostsPerHour: 0, maxPostsPerDay: 0, minScore: 101 },
    };
    this.maxOfferAgeHours = readNumber(env.TELEGRAM_MAX_OFFER_AGE_HOURS, 24, 1);

    this.publishStartHour = readNumber(env.TELEGRAM_PUBLISH_START_HOUR, 7, 0);
    this.publishEndHour = readNumber(env.TELEGRAM_PUBLISH_END_HOUR, 22, 0);
    this.timezone = env.APP_TIMEZONE || 'America/Sao_Paulo';
  }

  policyFor(type: ChannelType): ProviderPolicy {
    return this.providers[type];
  }

  /** Algum destino com publicacao automatica ligada? */
  get anyAutoPublishEnabled(): boolean {
    return Object.values(this.providers).some((policy) => policy.enabled);
  }

  /**
   * Piso de score da consulta ampla de candidatos; o filtro fino por provider
   * acontece depois, por canal.
   *
   * Com nenhum destino habilitado cai para o menor score configurado entre os
   * destinos publicaveis - assim o relatorio continua mostrando quantas
   * oportunidades existiriam se o autopilot fosse ligado.
   */
  get selectionMinScore(): number {
    const publishable = [this.providers.TELEGRAM, this.providers.FACEBOOK];
    const enabled = publishable.filter((policy) => policy.enabled);
    const considered = enabled.length > 0 ? enabled : publishable;

    return Math.min(...considered.map((policy) => policy.minScore));
  }

  /**
   * Hora local (0-23) na timezone configurada. Usa Intl para nao depender de
   * biblioteca de datas nem do fuso do processo.
   */
  localHour(now: Date): number {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timezone,
      hour: 'numeric',
      hour12: false,
    }).format(now);

    return Number(formatted) % 24;
  }

  /**
   * Janela de publicacao. `start === end` significa "sem restricao de horario".
   * Janelas que cruzam a meia-noite (ex.: 22 -> 6) sao suportadas.
   */
  isWithinPublishWindow(now: Date): boolean {
    const { publishStartHour: start, publishEndHour: end } = this;

    if (start === end) return true;

    const hour = this.localHour(now);

    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
  }
}

export interface ProviderPolicy {
  enabled: boolean;
  maxPostsPerHour: number;
  maxPostsPerDay: number;
  minScore: number;
}

function readNumber(raw: string | undefined, fallback: number, min: number): number {
  const value = Number(raw);

  return Number.isFinite(value) && value >= min ? value : fallback;
}

function readBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;

  return raw.toLowerCase() === 'true';
}
