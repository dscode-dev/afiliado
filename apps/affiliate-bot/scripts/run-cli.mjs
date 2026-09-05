//
// Resolucao do tsx, compartilhada pelos comandos de linha do affiliate-bot.
//
// Existe como .mjs puro (sem TypeScript, sem dependencias) porque precisa
// carregar TAMBEM dentro do container, onde a imagem de runtime so tem `dist/`
// e o `package.json` -- `src/` nao existe la. Um guard escrito em TypeScript
// nunca chegaria a executar: o `tsx` falharia antes, com ERR_MODULE_NOT_FOUND.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function fail(lines) {
  process.stderr.write('\n' + lines.join('\n') + '\n\n');
  process.exit(1);
}

export function inContainer() {
  return existsSync('/.dockerenv') || process.env.AFFILIATE_IN_CONTAINER === '1';
}

/**
 * Caminho do CLI do tsx, em JavaScript.
 *
 * Deliberadamente NAO usamos `node_modules/.bin/tsx`: no Windows o npm cria ali
 * um `tsx` sem extensao (script sh, para o Git Bash) ao lado de `tsx.cmd`, e
 * `spawnSync` nao consegue executar o primeiro -- falha sem status, sem saida,
 * sem nada que explique o problema.
 *
 * Resolver o entry declarado pelo proprio pacote e roda-lo com o Node atual
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

/** Executa `src/<entryFile>` sob o tsx, repassando os argumentos do operador. */
export function runCli(entryFile) {
  const cli = findTsxCli();
  const entry = join(packageRoot, 'src', entryFile);

  if (!cli || !existsSync(entry)) {
    fail([
      'Nao encontrei o que e preciso para rodar este comando.',
      `  tsx:          ${cli ?? 'nao instalado'}`,
      `  src/${entryFile}: ${existsSync(entry) ? 'ok' : 'ausente'}`,
      '',
      'Rode `npm install` na raiz do projeto e tente de novo.',
    ]);
  }

  const result = spawnSync(process.execPath, [cli, entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: packageRoot,
  });

  // Sem isto, uma falha ao INICIAR o processo sairia com codigo 1 e nenhuma
  // mensagem -- indistinguivel de um comando recusado.
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
}
