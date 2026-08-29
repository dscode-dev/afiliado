import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Hashing de senha com argon2id.
 *
 * Parametros de producao seguem a recomendacao do OWASP (19 MiB, 2 iteracoes,
 * paralelismo 1). Em teste o custo cai para que a suite continue rapida - a
 * seguranca do ambiente de teste nao depende do custo do KDF.
 */
@Injectable()
export class PasswordService {
  // `raw: false` seleciona a sobrecarga que devolve o digest como string.
  private readonly options: argon2.HashOptions & { raw?: false };

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const cheap = env.APP_ENV === 'test';

    this.options = {
      type: argon2.argon2id,
      memoryCost: cheap ? 4096 : 19456,
      timeCost: cheap ? 1 : 2,
      parallelism: 1,
    };
  }

  hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, this.options);
  }

  /** Nunca lanca: uma verificacao invalida e apenas `false`. */
  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      return false;
    }
  }
}
