import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conexao com PostgreSQL estabelecida');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Ping usado pelo health check. Lanca se o banco nao responder. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
