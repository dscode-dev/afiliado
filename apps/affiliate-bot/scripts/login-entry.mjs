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
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(lines) {
  process.stderr.write('\n' + lines.join('\n') + '\n\n');
  process.exit(1);
}

function inContainer() {
  return existsSync('/.dockerenv') || process.env.AFFILIATE_IN_CONTAINER === '1';
}

if (inContainer()) {
  fail([
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
  ]);
}

/**
 * Caminho do CLI do tsx, em JavaScript.
 *
 * Deliberadamente NAO usamos `node_modules/.bin/tsx`: no Windows o npm cria ali
 * um `tsx` sem extensao (script sh, para o Git Bash) ao lado de `tsx.cmd`, e
 * `spawnSync` nao consegue executar o primeiro -- falha sem status, sem saida,
 * sem nada que explique o problema.
 *
 * Resolver o entry declarado pelo proprio pacote e rodá-lo com o Node atual
 * funciona igual nos tres sistemas, sem shell no meio.
 */
function findTsxCli() {
  const require = createRequire(import.meta.url);

  try {
    const manifest = require.resolve('tsx/package.json');
    const bin = JSON.parse(readFileSync(manifest, 'utf8')).bin;
    const relative = typeof bin === 'string' ? bin : bin?.tsx;
    if (relative) {
      const cli = resolve(dirname(manifest), relative);
      if (existsSync(cli)) return cli;
    }
  } catch {
    // Cai para a busca manual abaixo.
  }

  // Fallback: sobe ate a raiz do workspace (o npm faz hoisting).
  let dir = packageRoot;
  for (;;) {
    const manifest = join(dir, 'node_modules', 'tsx', 'package.json');
    if (existsSync(manifest)) {
      try {
        const bin = JSON.parse(readFileSync(manifest, 'utf8')).bin;
        const relative = typeof bin === 'string' ? bin : bin?.tsx;
        const cli = resolve(dirname(manifest), relative ?? 'dist/cli.mjs');
        if (existsSync(cli)) return cli;
      } catch {
        // manifest ilegivel: segue subindo
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const cli = findTsxCli();
const entry = join(packageRoot, 'src', 'login.ts');

if (!cli || !existsSync(entry)) {
  fail([
    'Nao encontrei o que e preciso para o login.',
    `  tsx:          ${cli ?? 'nao instalado'}`,
    `  src/login.ts: ${existsSync(entry) ? 'ok' : 'ausente'}`,
    '',
    'Rode `npm install` na raiz do projeto e tente de novo.',
  ]);
}

const result = spawnSync(process.execPath, [cli, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: packageRoot,
});

// Sem isto, uma falha ao INICIAR o processo sairia com codigo 1 e nenhuma
// mensagem -- indistinguivel de um login recusado.
if (result.error) {
  fail([
    'Nao consegui iniciar o tsx.',
    `  ${result.error.message}`,
    '',
    `  node: ${process.execPath}`,
    `  cli : ${cli}`,
  ]);
}

process.exit(result.status ?? 1);
