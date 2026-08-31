import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { config } from './config';

/**
 * Abre um browser visivel para o operador autenticar UMA vez na Central de
 * Afiliados. A sessao fica no contexto persistente e e reaproveitada.
 *
 * Nao ha tentativa de burlar MFA, captcha ou confirmacao de dispositivo: quem
 * autentica e a pessoa. Isso nao e operacao manual por produto - e uma
 * autenticacao eventual de conta, que cobre milhares de links.
 *
 * PRECISA rodar na maquina do operador, nunca dentro do container: abrir uma
 * janela de browser exige uma sessao grafica.
 */
async function main(): Promise<void> {
  if (config.inContainer) {
    process.stderr.write(
      [
        'Este comando abre uma janela de browser e NAO funciona dentro do container.',
        '',
        'Rode na sua maquina, na raiz do projeto:',
        '',
        '    npm run affiliate:login',
        '',
        'O container le o mesmo perfil por bind mount, entao a sessao vale para os dois.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  mkdirSync(config.profilePath, { recursive: true });

  process.stdout.write(
    [
      'Abrindo a Central de Afiliados do Mercado Livre...',
      `Perfil da sessao: ${config.profilePath}`,
      '',
      '1. Faca login na janela que abriu (inclusive MFA, se pedir).',
      '2. Espere a Central carregar.',
      '3. FECHE a janela do browser para salvar a sessao.',
      '',
    ].join('\n'),
  );

  const context = await chromium.launchPersistentContext(config.profilePath, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(config.consoleUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);

  // Confirma a sessao enquanto a janela ainda esta aberta.
  let confirmed: string | null = null;
  const poll = setInterval(() => {
    void page
      .evaluate(async () => {
        const res = await fetch('/affiliate-program/api/v2/stripe/user/tags', {
          credentials: 'include',
        });
        if (!res.ok) return null;
        const body = (await res.json().catch(() => null)) as {
          tags?: { tag?: string; in_use?: boolean; status?: string }[];
        } | null;
        const tags = body?.tags ?? [];
        const active = tags.find((t) => t.in_use === true || t.status === 'in_use') ?? tags[0];
        return active?.tag ?? null;
      })
      .then((tag) => {
        if (tag && !confirmed) {
          confirmed = tag;
          process.stdout.write(`Sessao reconhecida. Tag ativa: ${tag}\n`);
          process.stdout.write('Pode fechar a janela.\n');
        }
      })
      .catch(() => undefined);
  }, 4000);

  // Exporta ANTES de fechar: depois o contexto ja nao responde.
  let exported = false;
  const exportSession = async (): Promise<void> => {
    if (exported) return;
    try {
      mkdirSync(dirname(config.sessionStatePath), { recursive: true });
      await context.storageState({ path: config.sessionStatePath });
      // Contem cookies de sessao em texto claro: so o dono le.
      chmodSync(config.sessionStatePath, 0o600);
      exported = true;
    } catch {
      // Reportado abaixo, junto com o resto do resultado.
    }
  };

  context.on('close', () => undefined);
  await new Promise<void>((resolve) => {
    const done = (): void => resolve();
    // Exporta periodicamente enquanto a janela vive, para nao depender de
    // conseguir falar com um contexto que ja esta fechando.
    const keep = setInterval(() => void exportSession(), 5000);
    context.on('close', () => {
      clearInterval(keep);
      done();
    });
  });
  clearInterval(poll);

  if (confirmed && exported) {
    process.stdout.write(
      [
        '',
        'Pronto. Sessao salva e validada.',
        `Sessao portatil: ${config.sessionStatePath}`,
        '',
        'E este arquivo que o container usa: o perfil do Chromium nao atravessa',
        'sistemas operacionais (os cookies sao cifrados com uma chave do SO).',
        '',
      ].join('\n'),
    );
    return;
  }

  if (confirmed && !exported) {
    process.stderr.write(
      [
        '',
        'A sessao foi reconhecida, mas nao consegui exportar o arquivo em:',
        `  ${config.sessionStatePath}`,
        '',
        'Sem ele o container continuara pedindo autenticacao. Verifique a',
        'permissao de escrita nessa pasta e rode o comando novamente.',
        '',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  process.stderr.write(
    [
      '',
      'A janela fechou, mas a sessao nao foi reconhecida.',
      'Confira se o login foi concluido e rode o comando novamente.',
      '',
    ].join('\n'),
  );
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  // Erro mais provavel numa maquina recem-configurada: o Playwright esta
  // instalado, mas o binario do Chromium ainda nao foi baixado.
  if (/Executable doesn't exist|playwright install/i.test(message)) {
    process.stderr.write(
      [
        '',
        'O browser do Playwright ainda nao foi baixado nesta maquina.',
        '',
        'Rode uma vez, na raiz do projeto:',
        '',
        '    npx playwright install chromium',
        '',
        'Depois repita `npm run affiliate:login`.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  process.stderr.write(`Falha ao abrir a sessao: ${message}\n`);
  process.exit(1);
});
