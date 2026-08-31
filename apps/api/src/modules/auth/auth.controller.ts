import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, AuthenticatedAdmin } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';
import { LoginDto } from './dto/login.dto';
import { CurrentAdmin } from './current-admin.decorator';
import { Public } from './public.decorator';
import { SESSION_COOKIE } from './admin-auth.guard';

interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthenticatedAdmin;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly throttle: LoginThrottleService,
  ) {}

  /**
   * Abre sessao administrativa.
   *
   * Devolve o token (consumido pelo painel, que o guarda em cookie HttpOnly
   * na propria origem) e tambem define o cookie, para uso direto da API.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const ip = clientIp(request);
    const retryAfter = this.throttle.retryAfterSeconds(dto.email, ip);

    if (retryAfter > 0) {
      response.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        'Too many login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const result = await this.auth.login(dto.email, dto.password);

      this.throttle.clear(dto.email, ip);
      response.cookie(SESSION_COOKIE, result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSecure(),
        path: '/',
        expires: result.expiresAt,
      });

      return {
        token: result.token,
        expiresAt: result.expiresAt.toISOString(),
        user: result.user,
      };
    } catch (error) {
      this.throttle.registerFailure(dto.email, ip);
      throw error;
    }
  }

  /** Idempotente: sem sessao tambem responde 204. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(bearerOrCookie(request));

    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  /** Quem esta autenticado agora. Exige sessao, como todo o resto. */
  @Get('me')
  me(@CurrentAdmin() admin: AuthenticatedAdmin): AuthenticatedAdmin {
    return admin;
  }
}

/**
 * IP do cliente. `trust proxy` e configurado explicitamente no bootstrap, entao
 * `request.ip` so considera X-Forwarded-For quando isso foi habilitado.
 */
function clientIp(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

function bearerOrCookie(request: Request): string | undefined {
  const header = request.headers.authorization;

  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || undefined;

  const cookies = request.headers.cookie ?? '';
  for (const part of cookies.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('=')) || undefined;
  }

  return undefined;
}

/**
 * Mesma regra do painel: `SESSION_COOKIE_SECURE` decide, e so cai no ambiente
 * quando ninguem declarou. Ver `apps/admin/lib/session.ts` para o porque.
 */
function cookieSecure(): boolean {
  const declared = process.env.SESSION_COOKIE_SECURE;
  if (declared !== undefined) return declared.toLowerCase() !== 'false';
  return process.env.APP_ENV === 'production';
}
