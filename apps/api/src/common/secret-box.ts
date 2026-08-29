import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Cifra simetrica para segredos que precisam sobreviver a reinicios.
 *
 * AES-256-GCM: confidencialidade e autenticidade. A chave e derivada por
 * scrypt a partir de `MELI_TOKEN_SECRET`, entao o segredo do ambiente pode ser
 * uma frase legivel sem enfraquecer a chave.
 *
 * Usado apenas para o refresh token do Mercado Livre, que e rotativo e nao
 * cabe em environment variable.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret) {
      throw new Error('SecretBox exige um segredo nao vazio');
    }

    // Salt fixo: a chave precisa ser reproduzivel entre reinicios, e o segredo
    // ja e de alta entropia. O que protege cada mensagem e o IV aleatorio.
    this.key = scryptSync(secret, 'garimpo/marketplace-credential', 32);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
  }

  /** Lanca se o texto foi adulterado ou a chave mudou. */
  decrypt(payload: string): string {
    const [iv, tag, data] = payload.split('.');

    if (!iv || !tag || !data) {
      throw new Error('Payload cifrado malformado');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
