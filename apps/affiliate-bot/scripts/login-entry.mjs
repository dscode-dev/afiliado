#!/usr/bin/env node
//
// Porta de entrada do `affiliate:login`.
//
// Existe como .mjs puro (sem TypeScript, sem dependencias) porque precisa rodar
// TAMBEM dentro do container, onde a imagem de runtime so carrega `dist/` e o
// `package.json` -- `src/` nao existe la. Um guard escrito em `src/login.ts`
// nunca chegaria a executar: o `tsx` falharia antes, com ERR_MODULE_NOT_FOUND.
//
// Na maquina do operador ele apenas delega para o script real em TypeScript.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function inContainer() {
  return existsSync('/.dockerenv') || process.env.AFFILIATE_IN_CONTAINER === '1';
}

if (inContainer()) {
  process.stderr.write(
    [
      '',
      'O login da Central de Afiliados NAO roda dentro do container.',
      '',
      'Ele precisa abrir uma janela de browser para voce autenticar, e o',
      'container nao tem sessao grafica (DISPLAY vazio).',
      '',
      'Rode na SUA maquina, na raiz do projeto:',
      '',
      '    npm run affiliate:login',
      '',
      'O container le o mesmo perfil por bind mount, entao a sessao que voce',
      'criar na sua maquina passa a valer para os dois.',
      '',
    ].join('\n') + '\n',
  );
  process.exit(1);
}

// Procura o tsx instalado, subindo ate a raiz do workspace (npm faz hoisting).
function findTsx() {
  let dir = packageRoot;
  for (;;) {
    const bin = join(dir, 'node_modules', '.bin', 'tsx');
    if (existsSync(bin)) return bin;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const tsx = findTsx();
const entry = join(packageRoot, 'src', 'login.ts');

if (!tsx || !existsSync(entry)) {
  process.stderr.write(
    [
      '',
      'Nao encontrei o que e preciso para o login.',
      `  tsx:          ${tsx ?? 'nao instalado'}`,
      `  src/login.ts: ${existsSync(entry) ? 'ok' : 'ausente'}`,
      '',
      'Rode `npm install` na raiz do projeto e tente de novo.',
      '',
    ].join('\n') + '\n',
  );
  process.exit(1);
}

const result = spawnSync(tsx, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: packageRoot,
});

process.exit(result.status ?? 1);
