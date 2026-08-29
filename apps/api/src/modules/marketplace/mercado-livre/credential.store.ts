import { Injectable, Logger } from '@nestjs/common';
import { Marketplace } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SecretBox } from '../../../common/secret-box';
import { MercadoLivreConfig } from './mercado-livre.config';

export interface StoredCredential {
  refreshToken: string;
  externalUserId: string | null;
}

/**
 * Guarda o refresh token do Mercado Livre, cifrado.
 *
 * Existe porque o refresh token e ROTATIVO: cada renovacao devolve um novo e
 * invalida o anterior, entao ele nao pode viver numa environment variable.
 */
@Injectable()
export class MercadoLivreCredentialStore {
  private readonly logger = new Logger(MercadoLivreCredentialStore.name);
  private box: SecretBox | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: MercadoLivreConfig,
  ) {}

  /** Falso quando `MELI_TOKEN_SECRET` nao esta configurado. */
  get isConfigured(): boolean {
    return Boolean(this.config.credentialSecret);
  }

  async read(): Promise<StoredCredential | null> {
    const box = this.secretBox();
    if (!box) return null;

    const row = await this.prisma.marketplaceCredential.findUnique({
      where: { marketplace: Marketplace.MERCADO_LIVRE },
    });

    if (!row) return null;

    try {
      return {
        refreshToken: box.decrypt(row.refreshTokenEnc),
        externalUserId: row.externalUserId,
      };
    } catch {
      // Chave trocada ou registro corrompido: tratamos como ausencia de
      // credencial, o que leva a nova autorizacao - nunca a um token invalido.
      this.logger.error(
        JSON.stringify({
          provider: 'mercado_livre',
          operation: 'read_credential',
          failure: 'decrypt_failed',
        }),
      );
      return null;
    }
  }

  async save(refreshToken: string, externalUserId?: string, scope?: string): Promise<void> {
    const box = this.secretBox();

    if (!box) {
      throw new Error('MELI_TOKEN_SECRET nao configurado: nao ha como guardar a credencial');
    }

    const refreshTokenEnc = box.encrypt(refreshToken);

    await this.prisma.marketplaceCredential.upsert({
      where: { marketplace: Marketplace.MERCADO_LIVRE },
      create: {
        marketplace: Marketplace.MERCADO_LIVRE,
        refreshTokenEnc,
        externalUserId: externalUserId ?? null,
        scope: scope ?? null,
      },
      update: { refreshTokenEnc, externalUserId: externalUserId ?? null, scope: scope ?? null },
    });

    // Sem token no log: apenas o fato e o usuario que autorizou.
    this.logger.log(
      JSON.stringify({
        provider: 'mercado_livre',
        operation: 'save_credential',
        externalUserId: externalUserId ?? null,
      }),
    );
  }

  async clear(): Promise<void> {
    await this.prisma.marketplaceCredential
      .delete({ where: { marketplace: Marketplace.MERCADO_LIVRE } })
      .catch(() => undefined);
  }

  private secretBox(): SecretBox | null {
    const secret = this.config.credentialSecret;
    if (!secret) return null;

    this.box ??= new SecretBox(secret);
    return this.box;
  }
}
