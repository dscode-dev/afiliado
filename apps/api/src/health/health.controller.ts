import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';

interface HealthResponse {
  status: 'ok' | 'error';
  uptime: number;
  timestamp: string;
  checks: {
    application: 'up';
    database: 'up' | 'down';
  };
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica que a aplicacao esta viva e que o PostgreSQL responde.
   * Retorna 503 quando o banco esta indisponivel, para que orquestradores
   * enxerguem a falha sem precisar interpretar o corpo da resposta.
   */
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

    response.status(database === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: database === 'up' ? 'ok' : 'error',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        application: 'up',
        database,
      },
    };
  }
}
