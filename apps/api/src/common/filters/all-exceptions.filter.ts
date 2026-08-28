import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MarketplaceFailure,
  MercadoLivreError,
} from '../../modules/marketplace/mercado-livre/mercado-livre.errors';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  stack?: string;
}

/**
 * Normaliza toda saida de erro da API em um unico formato.
 * Stack trace so aparece fora de producao.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error, message } = this.resolve(exception);

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (process.env.APP_ENV !== 'production' && exception instanceof Error && exception.stack) {
      body.stack = exception.stack;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, error: exception.name, message: payload };
      }

      const record = payload as Record<string, unknown>;
      return {
        status,
        error: (record.error as string) ?? exception.name,
        message: (record.message as string | string[]) ?? exception.message,
      };
    }

    if (exception instanceof MercadoLivreError) {
      return this.resolveMarketplace(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrisma(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Erro interno inesperado',
    };
  }

  /**
   * Falha externa vira status interno consistente. A mensagem e sempre a nossa:
   * a resposta bruta do Mercado Livre nunca chega ao cliente da API.
   */
  private resolveMarketplace(exception: MercadoLivreError): {
    status: number;
    error: string;
    message: string;
  } {
    const { status, error } = MARKETPLACE_STATUS[exception.failure];

    return { status, error, message: exception.message };
  }

  private resolvePrisma(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    error: string;
    message: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = exception.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'registro');
        return {
          status: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: `Ja existe um registro com o mesmo valor para: ${fields}`,
        };
      }
      case 'P2003':
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
          message: 'Referencia invalida: o registro relacionado nao existe',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'Registro nao encontrado',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: 'Erro ao acessar o banco de dados',
        };
    }
  }
}

/**
 * `unauthorized` vira 502: credencial ausente e problema de configuracao nossa,
 * nao do cliente que chamou a API interna.
 */
const MARKETPLACE_STATUS: Record<MarketplaceFailure, { status: number; error: string }> = {
  invalid_item: { status: HttpStatus.UNPROCESSABLE_ENTITY, error: 'Unprocessable Entity' },
  not_found: { status: HttpStatus.NOT_FOUND, error: 'Not Found' },
  unauthorized: { status: HttpStatus.BAD_GATEWAY, error: 'Bad Gateway' },
  rate_limited: { status: HttpStatus.TOO_MANY_REQUESTS, error: 'Too Many Requests' },
  timeout: { status: HttpStatus.GATEWAY_TIMEOUT, error: 'Gateway Timeout' },
  unavailable: { status: HttpStatus.SERVICE_UNAVAILABLE, error: 'Service Unavailable' },
};
