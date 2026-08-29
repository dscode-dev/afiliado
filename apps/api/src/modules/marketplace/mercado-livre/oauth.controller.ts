import {
  Controller,
  Get,
  Logger,
  Query,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Public } from '../../auth/public.decorator';
import { MercadoLivreConfig } from './mercado-livre.config';
import { MercadoLivreCredentialStore } from './credential.store';
import { MercadoLivreTokenService } from './mercado-livre-token.service';

/** Autorizacoes pendentes. Vida curta, instancia unica - basta memoria. */
const STATE_TTL_MS = 10 * 60_000;

/**
 * Authorization Code do Mercado Livre.
 *
 * Necessario porque `client_credentials` so alcanca `/categories`: itens,
 * precos, highlights e vendedores exigem contexto de usuario. O operador
 * autoriza UMA vez; depois o refresh token rotativo mantem a integracao viva.
 */
@Controller('auth/mercado-livre')
export class MercadoLivreOAuthController {
  private readonly logger = new Logger('MercadoLivreOAuth');
  private readonly pendingStates = new Map<string, number>();

  constructor(
    private readonly config: MercadoLivreConfig,
    private readonly tokens: MercadoLivreTokenService,
    private readonly credentials: MercadoLivreCredentialStore,
  ) {}

  /** Inicia a autorizacao. Exige sessao administrativa. */
  @Get('authorize')
  authorize(@Res({ passthrough: true }) response: Response): { authorizationUrl: string } {
    if (!this.config.isConfigured) {
      throw new UnprocessableEntityException('MELI_CLIENT_ID/SECRET nao configurados');
    }
    if (!this.config.redirectUri) {
      throw new UnprocessableEntityException('MELI_REDIRECT_URI nao configurada');
    }
    if (!this.credentials.isConfigured) {
      throw new UnprocessableEntityException(
        'MELI_TOKEN_SECRET nao configurado: nao ha como guardar a credencial com seguranca',
      );
    }

    const state = randomBytes(24).toString('base64url');
    this.rememberState(state);

    response.status(200);
    return { authorizationUrl: this.config.authorizationUrl(state) };
  }

  /**
   * Callback do Mercado Livre.
   *
   * Publico porque quem chega aqui e o browser do operador vindo do Mercado
   * Livre, sem cookie de sessao da API. O `state` e o que garante que a
   * autorizacao partiu de nos.
   */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: string; message: string; externalUserId?: string | null }> {
    if (error) {
      this.logger.warn(
        JSON.stringify({ provider: 'mercado_livre', operation: 'callback', failure: 'denied' }),
      );
      response.status(400);
      return { status: 'error', message: 'Autorizacao negada no Mercado Livre.' };
    }

    if (!code || !state || !this.consumeState(state)) {
      this.logger.warn(
        JSON.stringify({
          provider: 'mercado_livre',
          operation: 'callback',
          failure: !code ? 'missing_code' : 'invalid_state',
        }),
      );
      response.status(400);
      return { status: 'error', message: 'Requisicao de autorizacao invalida ou expirada.' };
    }

    // O `code` nunca e logado: e uma credencial de uso unico.
    const { externalUserId } = await this.tokens.exchangeAuthorizationCode(code);

    return {
      status: 'ok',
      message: 'Mercado Livre autorizado. Pode fechar esta janela.',
      externalUserId,
    };
  }

  /** Situacao da autorizacao, para o painel. */
  @Get('status')
  async status(): Promise<{
    configured: boolean;
    authorized: boolean;
    externalUserId: string | null;
    redirectUri: string | null;
  }> {
    const stored = await this.credentials.read();

    return {
      configured: this.config.isConfigured && this.credentials.isConfigured,
      authorized: stored !== null,
      externalUserId: stored?.externalUserId ?? null,
      redirectUri: this.config.redirectUri ?? null,
    };
  }

  private rememberState(state: string): void {
    const now = Date.now();

    for (const [key, createdAt] of this.pendingStates) {
      if (now - createdAt > STATE_TTL_MS) this.pendingStates.delete(key);
    }

    this.pendingStates.set(state, now);
  }

  /** Comparacao em tempo constante e uso unico. */
  private consumeState(candidate: string): boolean {
    for (const [known, createdAt] of this.pendingStates) {
      if (Date.now() - createdAt > STATE_TTL_MS) {
        this.pendingStates.delete(known);
        continue;
      }

      const a = Buffer.from(known);
      const b = Buffer.from(candidate);

      if (a.length === b.length && timingSafeEqual(a, b)) {
        this.pendingStates.delete(known);
        return true;
      }
    }

    return false;
  }
}
