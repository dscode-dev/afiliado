import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toMoneyString } from '../../common/money';

export interface PriceSnapshotView {
  price: string;
  originalPrice: string | null;
  currencyId: string | null;
  capturedAt: string;
}

export interface SnapshotInput {
  price: Prisma.Decimal;
  originalPrice: Prisma.Decimal | null;
  currencyId: string | null;
}

/** Limite padrao e maximo do historico retornado pela API. */
export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 500;

/**
 * Historico de precos. Snapshots sao imutaveis: nunca sao atualizados,
 * apenas inseridos quando o preco efetivamente muda.
 */
@Injectable()
export class PriceSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grava um snapshot somente se o preco mudou em relacao ao ultimo registrado.
   * Retorna `true` quando um novo ponto historico foi criado.
   *
   * Aceita um client transacional para participar da mesma transacao do sync.
   */
  async recordIfChanged(
    productId: string,
    input: SnapshotInput,
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<boolean> {
    const latest = await client.priceSnapshot.findFirst({
      where: { productId },
      orderBy: { capturedAt: 'desc' },
      select: { price: true, originalPrice: true },
    });

    if (latest && isSamePrice(latest, input)) {
      return false;
    }

    await client.priceSnapshot.create({
      data: {
        productId,
        price: input.price,
        originalPrice: input.originalPrice,
        currencyId: input.currencyId,
      },
    });

    return true;
  }

  /** Historico do mais recente para o mais antigo. */
  async history(productId: string, limit: number): Promise<PriceSnapshotView[]> {
    const rows = await this.prisma.priceSnapshot.findMany({
      where: { productId },
      orderBy: { capturedAt: 'desc' },
      take: Math.min(limit, MAX_HISTORY_LIMIT),
    });

    return rows.map((row) => ({
      price: toMoneyString(row.price) as string,
      originalPrice: toMoneyString(row.originalPrice),
      currencyId: row.currencyId,
      capturedAt: row.capturedAt.toISOString(),
    }));
  }
}

function isSamePrice(
  latest: { price: Prisma.Decimal; originalPrice: Prisma.Decimal | null },
  input: SnapshotInput,
): boolean {
  if (!latest.price.equals(input.price)) return false;

  if (latest.originalPrice === null || input.originalPrice === null) {
    return latest.originalPrice === input.originalPrice;
  }

  return latest.originalPrice.equals(input.originalPrice);
}
