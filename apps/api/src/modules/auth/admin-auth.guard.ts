import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService, AuthenticatedAdmin } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Nome do cookie de sessao, tambem usado pelo painel. */
export const SESSION_COOKIE = 'garimpo_session';

/**
 * Guard global: autenticado por padrao.
 *
 * Aceita `Authorization: Bearer <token>` (usado pelo painel, que encaminha o
 * token do proprio cookie) ou o cookie de sessao, quando a API for acessada
 * diretamente pelo browser.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();
    const admin = await this.auth.validate(extractToken(request));

    if (!admin) {
      throw new UnauthorizedException('Authentication required');
    }

    request.admin = admin;
    return true;
  }
}

function extractToken(request: Request): string | undefined {
  const header = request.headers.authorization;

  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || undefined;
  }

  // Fallback: cookie enviado diretamente por um browser.
  const cookies = request.headers.cookie;
  if (!cookies) return undefined;

  for (const part of cookies.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(rest.join('=')) || undefined;
    }
  }

  return undefined;
}
