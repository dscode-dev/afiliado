// Cria um administrador do Garimpo.
//
// Nao existe cadastro publico: este comando e a unica porta de entrada.
// A senha e lida com o eco desligado e nunca aparece na tela, no historico do
// shell ou em log.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '..', '..', '..', '.env'), quiet: true });

const MIN_PASSWORD_LENGTH = 12;

const CTRL_C_CHAR = '\u0003';
const BACKSPACE_CHAR = '\u007f';

/** Le uma linha do stdin. Com `hidden`, nada e ecoado no terminal. */
function ask(question, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;

    if (!stdin.isTTY) {
      reject(new Error('Este comando precisa de um terminal interativo.'));
      return;
    }

    stdout.write(question);

    let value = '';
    const wasRaw = stdin.isRaw;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const finish = (result) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\n');
      resolve(result);
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\n' || char === '\r') {
          finish(value);
          return;
        }

        if (char === CTRL_C_CHAR) {
          stdin.removeListener('data', onData);
          stdin.setRawMode(wasRaw);
          stdout.write('\n');
          process.exit(130);
        }

        if (char === BACKSPACE_CHAR || char === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            if (!hidden) stdout.write('\b \b');
          }
          continue;
        }

        value += char;
        if (!hidden) stdout.write(char);
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const provided = process.argv[2];
    const email = (provided ?? (await ask('Email do admin: '))).trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error('Email invalido.');
      process.exitCode = 1;
      return;
    }

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      // Nunca sobrescreve: recriar seria uma troca silenciosa de senha.
      console.error(`Ja existe um admin com o email ${email}. Nenhuma alteracao foi feita.`);
      process.exitCode = 1;
      return;
    }

    const password = await ask('Senha: ', { hidden: true });
    if (password.length < MIN_PASSWORD_LENGTH) {
      console.error(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      process.exitCode = 1;
      return;
    }

    if ((await ask('Confirme a senha: ', { hidden: true })) !== password) {
      console.error('As senhas nao conferem.');
      process.exitCode = 1;
      return;
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    const created = await prisma.adminUser.create({
      data: { email, passwordHash },
      select: { id: true, email: true },
    });

    // Somente id e email: nunca a senha nem o hash.
    console.log(`Admin criado: ${created.email} (${created.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Falha ao criar o admin:', error instanceof Error ? error.message : error);
  process.exit(1);
});
