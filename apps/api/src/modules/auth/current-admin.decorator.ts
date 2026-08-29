import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedAdmin } from './auth.service';

/** Admin da sessao atual, populado pelo AdminAuthGuard. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin | undefined => {
    const request = context.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();

    return request.admin;
  },
);
