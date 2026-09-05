#!/usr/bin/env node
//
// Porta de entrada do `affiliate:login`.
//
// O guard de container vive aqui, e nao em `src/login.ts`, porque a imagem de
// runtime nao carrega `src/`: um guard em TypeScript nunca chegaria a rodar.

import { fail, inContainer, runCli } from './run-cli.mjs';

if (inContainer()) {
  fail([
    'O login da Central de Afiliados NAO roda dentro do container.',
    '',
    'Ele precisa abrir uma janela do SEU Chrome para voce autenticar, e o',
    'container nao tem sessao grafica (DISPLAY vazio) nem Chrome instalado.',
    '',
    'Rode na SUA maquina, na raiz do projeto:',
    '',
    '    npm run affiliate:login',
    '',
    'O container le a mesma sessao por bind mount, entao o login que voce',
    'fizer na sua maquina passa a valer para os dois.',
  ]);
}

runCli('login.ts');
