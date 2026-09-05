import { existsSync } from 'node:fs';

export interface InstalledBrowser {
  name: string;
  executable: string;
}

/**
 * Localiza um Chrome ou Edge JA INSTALADO na maquina do operador.
 *
 * O login usa o browser real da pessoa, nunca o Chromium que vem com o
 * Playwright. A diferenca importa: o Chromium do Playwright e uma build de
 * teste, sem os componentes proprietarios do Chrome, e quando o proprio
 * Playwright o inicia ele ainda ganha `--enable-automation` (que liga
 * `navigator.webdriver`) e uma porta de automacao aberta desde o processo
 * zero. Para a deteccao de bot do Mercado Livre isso e um sinal claro -- e o
 * preco e a conta cair em verificacao ou bloqueio por "excesso de tentativas".
 *
 * Um Chrome de verdade, iniciado como qualquer outro atalho, nao carrega
 * nenhuma dessas marcas.
 */
export function findInstalledBrowser(): InstalledBrowser | null {
  for (const candidate of candidates()) {
    if (existsSync(candidate.executable)) return candidate;
  }

  return null;
}

function candidates(): InstalledBrowser[] {
  const env = process.env;

  if (process.platform === 'win32') {
    const programFiles = env.ProgramFiles ?? 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = env.LOCALAPPDATA ?? '';

    return [
      { name: 'Google Chrome', executable: `${programFiles}\\Google\\Chrome\\Application\\chrome.exe` },
      { name: 'Google Chrome', executable: `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe` },
      { name: 'Google Chrome', executable: `${localAppData}\\Google\\Chrome\\Application\\chrome.exe` },
      { name: 'Microsoft Edge', executable: `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe` },
      { name: 'Microsoft Edge', executable: `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe` },
    ];
  }

  if (process.platform === 'darwin') {
    return [
      {
        name: 'Google Chrome',
        executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      },
      {
        name: 'Microsoft Edge',
        executable: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      },
    ];
  }

  return [
    { name: 'Google Chrome', executable: '/usr/bin/google-chrome' },
    { name: 'Google Chrome', executable: '/usr/bin/google-chrome-stable' },
    { name: 'Chromium', executable: '/usr/bin/chromium' },
    { name: 'Chromium', executable: '/usr/bin/chromium-browser' },
    { name: 'Microsoft Edge', executable: '/usr/bin/microsoft-edge' },
  ];
}
