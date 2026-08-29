import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminAuthGuard } from './admin-auth.guard';
import { AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';
import { PasswordService } from './password.service';

/**
 * Autenticacao administrativa.
 *
 * O guard e registrado como APP_GUARD: vale para toda a aplicacao, e rotas
 * publicas precisam ser marcadas com `@Public()`. Assim um controller novo
 * nasce protegido em vez de nascer aberto.
 */
@Module({
  controllers: [AuthController],
  providers: [
    { provide: AuthConfig, useFactory: () => new AuthConfig() },
    { provide: PasswordService, useFactory: () => new PasswordService() },
    LoginThrottleService,
    AuthService,
    { provide: APP_GUARD, useClass: AdminAuthGuard },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
