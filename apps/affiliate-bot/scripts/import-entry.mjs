#!/usr/bin/env node
//
// Porta de entrada do `affiliate:import`.
//
// Diferente do login, este comando nao abre browser nenhum, entao roda em
// qualquer lugar -- inclusive dentro do container, se for onde o arquivo de
// cookies estiver.

import { runCli } from './run-cli.mjs';

runCli('import-session.ts');
