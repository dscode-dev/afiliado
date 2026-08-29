import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { AffiliateBotClient } from '../modules/affiliate/generation/affiliate-bot.client';
import { Public } from '../modules/auth/public.decorator';

interface HealthResponse {
  status: 'ok' | 'error';
  uptime: number;
  timestamp: string;
  checks: {
    application: 'up';
    database: 'up' | 'down';
    /** Sessao do affiliate-bot. Nao afeta o status geral: ele e opcional. */
    affiliateBot: 'READY' | 'AUTH_REQUIRED' | 'UNAVAILABLE';
  };
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly affiliateBot: AffiliateBotClient,
  ) {}

  /**
   * Verifica que a aplicacao esta viva e que o PostgreSQL responde.
   *
   * Publico de proposito: orquestradores precisam consultar sem credencial.
   * A resposta traz apenas status - nunca versao, URL do banco ou stack.
   * Retorna 503 quando o banco esta indisponivel, para que orquestradores
   * enxerguem a falha sem precisar interpretar o corpo da resposta.
   */
  @Public()
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    let database: 'up' | 'down' = 'up';

    try {
      await this.prisma.ping();
    } catch (error) {
      database = 'down';
      this.logger.error(
        'Health check falhou ao consultar o PostgreSQL',
        error instanceof Error ? error.stack : undefined,
      );
    }

    // O bot e opcional: sem ele o Garimpo continua operando com os links que
    // ja existem, entao ele nao derruba o health.
    const affiliateBot = (await this.affiliateBot.status()).status;

    response.status(database === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: database === 'up' ? 'ok' : 'error',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        application: 'up',
        database,
        affiliateBot,
      },
    };
  }
}
