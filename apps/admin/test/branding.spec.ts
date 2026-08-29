import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const admin = join(__dirname, '..');
const repoRoot = join(admin, '..', '..');

const read = (relative: string) => readFileSync(join(admin, relative), 'utf8');

describe('Branding Garimpo', () => {
  it('serve a logo original em /assets/logo.png', () => {
    const served = join(admin, 'public', 'assets', 'logo.png');

    expect(existsSync(served)).toBe(true);
    // Byte a byte identica ao asset fornecido: nada foi editado ou regerado.
    expect(readFileSync(served)).toEqual(readFileSync(join(repoRoot, 'assets', 'logo.png')));
    expect(statSync(served).size).toBeGreaterThan(0);
  });

  it('usa exatamente /assets/logo.png na sidebar, no dashboard e no login', () => {
    // A sidebar vive no layout autenticado; /login tem a propria.
    expect(read('app/(app)/layout.tsx')).toContain('src="/assets/logo.png"');
    expect(read('app/(app)/dashboard/page.tsx')).toContain('src="/assets/logo.png"');
    expect(read('app/login/page.tsx')).toContain('src="/assets/logo.png"');
  });

  it('preserva a proporcao da logo, sem esticar', () => {
    const css = read('app/globals.css');

    // `height: auto` com largura fluida mantem a proporcao 3:1 original.
    for (const selector of ['brand-logo', 'dashboard-logo', 'login-logo']) {
      expect(css).toMatch(new RegExp(`\\.${selector}\\s*{[^}]*height:\\s*auto`, 's'));
      // Nenhuma altura fixa que deformaria a imagem.
      expect(css).not.toMatch(new RegExp(`\\.${selector}\\s*{[^}]*height:\\s*\\d+px`, 's'));
    }
  });

  it('declara metadata do Garimpo', () => {
    const layout = read('app/layout.tsx');

    expect(layout).toContain("title: 'Garimpo'");
    expect(layout).toContain('oportunidades de compra');
    expect(layout).toContain("icon: '/assets/logo.png'");
  });

  it('aplica a paleta amostrada da logo', () => {
    const css = read('app/globals.css');

    expect(css).toContain('--brand-deep: #002030');
    expect(css).toContain('--gold: #f0b000');
  });

  it('nao exibe mais o nome antigo do produto na interface', () => {
    const root = read('app/layout.tsx');
    const sidebar = read('app/(app)/layout.tsx');
    const dashboard = read('app/(app)/dashboard/page.tsx');

    expect(sidebar).not.toContain('<h1>Afiliado</h1>');
    expect(root).not.toContain("title: 'Afiliado");
    expect(root).toContain("title: 'Garimpo'");
    expect(dashboard).toContain('Garimpo');
  });
});
