import { chromium } from 'playwright';
import { config } from './config';

/**
 * Abre um browser visivel para o operador autenticar UMA vez na Central de
 * Afiliados. A sessao fica no contexto persistente e e reaproveitada.
 *
 * Nao ha tentativa de burlar MFA, captcha ou confirmacao de dispositivo: quem
 * autentica e a pessoa. Isso nao e operacao manual por produto - e uma
 * autenticacao eventual de conta.
 */
async function main(): Promise<void> {
  process.stdout.write('Abrindo a Central de Afiliados para autenticacao...\n');

  const context = await chromium.launchPersistentContext(config.profilePath, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(config.consoleUrl, { waitUntil: 'domcontentloaded' });

  process.stdout.write(
    'Faca login e deixe a Central aberta. Feche a janela quando terminar.\n' +
      'A sessao fica salva no perfil configurado em AFFILIATE_BROWSER_PROFILE_PATH.\n',
  );

  await new Promise<void>((resolve) => context.on('close', () => resolve()));
  process.stdout.write('Sessao salva.\n');
}

main().catch((error) => {
  process.stderr.write(`Falha ao abrir a sessao: ${error instanceof Error ? error.message : ''}\n`);
  process.exit(1);
});
