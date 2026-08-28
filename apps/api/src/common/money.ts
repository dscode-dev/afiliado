import { Prisma } from '@prisma/client';

/**
 * Valores monetarios sao persistidos como NUMERIC(12,2) e trafegam na API
 * como string, evitando perda de precisao de ponto flutuante em JSON.
 */
export function toMoneyString(value: Prisma.Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(2);
}

export function toDecimalString(value: Prisma.Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}
