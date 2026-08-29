import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AdminUser } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthConfig } from './auth.config';
import { PasswordService } from './password.service';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
}

export interface LoginResult {
  /** Token opaco. Devolvido uma unica vez; no banco fica so o hash. */
  token: string;
  expiresAt: Date;
  user: AuthenticatedAdmin;
}

/** Mensagem unica: nunca revela se o email existe ou se a senha errou. */
const GENERIC_FAILURE = 'Invalid credentials';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AdminAuth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly config: AuthConfig,
  ) {}

  /**
   * Autentica e abre sessao.
   *
   * O tempo de resposta e mantido parecido entre "email inexistente" e "senha
   * errada": quando o usuario nao existe, ainda assim gastamos uma verificacao
   * de hash, para nao vazar a existencia do email por timing.
   */
  async login(email: string, password: string, now = new Date()): Promise<LoginResult> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.adminUser.findUnique({ where: { email: normalized } });

    const valid = user
      ? await this.passwords.verify(user.passwordHash, password)
      : await this.wasteTime(password);

    if (!user || !valid || !user.active) {
      this.logger.warn(
        JSON.stringify({
          event: 'login_failed',
          // Sem email, sem senha: apenas o motivo interno.
          reason: !user ? 'unknown_user' : !valid ? 'bad_password' : 'inactive_user',
        }),
      );

      throw new UnauthorizedException(GENERIC_FAILURE);
    }

    const session = await this.createSession(user, now);

    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: now },
    });

    // Aproveita o login para limpar sessoes vencidas: sem job dedicado.
    await this.purgeExpired(now);

    this.logger.log(JSON.stringify({ event: 'login_success', adminUserId: user.id }));

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: { id: user.id, email: user.email },
    };
  }

  /**
   * Valida o token do cookie. Retorna null para qualquer falha - o chamador
   * decide o status, e nunca expomos o motivo.
   */
  async validate(token: string | undefined, now = new Date()): Promise<AuthenticatedAdmin | null> {
    if (!token) return null;

    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!session) return null;

    if (session.expiresAt <= now) {
      await this.prisma.adminSession.delete({ where: { id: session.id } }).catch(() => undefined);
      this.logger.log(
        JSON.stringify({ event: 'session_expired', adminUserId: session.adminUserId }),
      );
      return null;
    }

    // Usuario desativado perde acesso imediatamente, mesmo com sessao viva.
    if (!session.user.active) return null;

    await this.prisma.adminSession
      .update({ where: { id: session.id }, data: { lastSeenAt: now } })
      .catch(() => undefined);

    return { id: session.user.id, email: session.user.email };
  }

  /** Idempotente: token ausente ou desconhecido tambem e sucesso. */
  async logout(token: string | undefined): Promise<void> {
    if (!token) return;

    const deleted = await this.prisma.adminSession.deleteMany({
      where: { tokenHash: hashToken(token) },
    });

    if (deleted.count > 0) {
      this.logger.log(JSON.stringify({ event: 'logout' }));
    }
  }

  private async createSession(
    user: AdminUser,
    now: Date,
  ): Promise<{ token: string; expiresAt: Date }> {
    // 32 bytes de CSPRNG: espaco de busca grande demais para forca bruta.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + this.config.sessionTtlMs);

    await this.prisma.adminSession.create({
      data: { adminUserId: user.id, tokenHash: hashToken(token), expiresAt },
    });

    return { token, expiresAt };
  }

  private async purgeExpired(now: Date): Promise<void> {
    await this.prisma.adminSession
      .deleteMany({ where: { expiresAt: { lte: now } } })
      .catch(() => undefined);
  }

  /**
   * Gasta o mesmo tempo de uma verificacao real quando o email nao existe.
   * O hash abaixo e de uma senha aleatoria fixa, so para consumir CPU.
   */
  private async wasteTime(password: string): Promise<boolean> {
    await this.passwords.verify(DUMMY_HASH, password);
    return false;
  }
}

/**
 * O token do cookie e aleatorio de alta entropia, nao uma senha: SHA-256 e a
 * escolha correta aqui. KDF lento so faria sentido contra baixa entropia.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparacao em tempo constante, para uso em testes e utilitarios. */
export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

/** Hash argon2id de uma senha descartavel, usado apenas para nivelar timing. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$JBGkkAaZ0nkCUS0Ju2Y7pNbNMYRSSFDPFpDFCoQx7hs';
