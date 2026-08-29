import { BrowserContext, chromium } from 'playwright';
import { config } from './config';
import { AffiliateBotError, GeneratedLink } from './types';

/**
 * ADAPTER NAO OFICIAL da Central de Afiliados do Mercado Livre.
 *
 * A API oficial de Developers NAO expoe geracao de link de afiliado. Este
 * adapter conversa com os endpoints internos que a propria Central usa, a
 * partir de uma sessao autenticada real do operador:
 *
 *   GET  /affiliate-program/api/v2/stripe/user/tags
 *   POST /affiliate-program/api/v2/stripe/user/links
 *
 * Consequencias assumidas e documentadas no README:
 *  - o Mercado Livre pode mudar ou remover esses endpoints sem aviso;
 *  - a sessao expira e exige uma nova autenticacao humana (AUTH_REQUIRED);
 *  - nada aqui e coberto por contrato de API.
 *
 * O browser existe SOMENTE para carregar essa sessao. Catalogo, precos,
 * vendedor e highlights continuam vindo da API oficial - nunca daqui.
 */
export class AffiliateConsole {
  private context: BrowserContext | null = null;
  private cachedTag: string | null = null;

  async open(): Promise<void> {
    if (this.context) return;

    this.context = await chromium.launchPersistentContext(config.profilePath, {
      headless: config.headless,
      viewport: { width: 1280, height: 800 },
    });
    this.context.setDefaultTimeout(config.timeoutMs);
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.cachedTag = null;
  }

  /**
   * Executa um fetch same-origin de dentro da Central, aproveitando a sessao
   * do contexto persistente.
   */
  private async sameOrigin<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ status: number; body: T | null }> {
    if (!this.context) throw new AffiliateBotError('UNAVAILABLE', 'Browser nao iniciado');

    const page = this.context.pages()[0] ?? (await this.context.newPage());

    if (!page.url().startsWith(config.apiOrigin)) {
      await page.goto(config.consoleUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    }

    return page.evaluate(
      async ({ url, method, body }: { url: string; method?: string; body?: unknown }) => {
        const response = await fetch(url, {
          method: method ?? 'GET',
          credentials: 'include',
          headers: body ? { 'Content-Type': 'application/json' } : {},
          ...(body ? { body: JSON.stringify(body) } : {}),
        });

        let parsed: unknown = null;
        try {
          parsed = await response.json();
        } catch {
          parsed = null;
        }

        return { status: response.status, body: parsed as never };
      },
      { url: `${config.apiOrigin}${path}`, method: init?.method, body: init?.body },
    );
  }

  /**
   * Descobre a tag ativa.
   *
   * Com varias tags e nenhuma marcada como em uso, falha explicitamente:
   * escolher uma ao acaso atribuiria a comissao a lugar errado.
   */
  async activeTag(force = false): Promise<string> {
    if (this.cachedTag && !force) return this.cachedTag;

    const { status, body } = await this.sameOrigin<{
      tags?: { tag?: string; status?: string; in_use?: boolean }[];
    }>('/affiliate-program/api/v2/stripe/user/tags');

    if (status === 401 || status === 403) {
      throw new AffiliateBotError('AUTH_REQUIRED', 'Sessao da Central de Afiliados expirada');
    }
    if (status >= 500) {
      throw new AffiliateBotError('UNAVAILABLE', `Central respondeu ${status}`);
    }

    const tags = body?.tags ?? [];
    if (tags.length === 0) {
      throw new AffiliateBotError('NO_ACTIVE_TAG', 'Nenhuma tag de afiliado encontrada');
    }

    const inUse = tags.filter((t) => t.in_use === true || t.status === 'in_use');
    const candidates = inUse.length > 0 ? inUse : tags;

    if (candidates.length > 1) {
      throw new AffiliateBotError(
        'AMBIGUOUS_TAG',
        `Ha ${candidates.length} tags candidatas e nenhuma unica em uso. Defina AFFILIATE_TAG.`,
      );
    }

    const tag = candidates[0]?.tag;
    if (!tag) {
      throw new AffiliateBotError('NO_ACTIVE_TAG', 'Tag ativa sem identificador utilizavel');
    }

    this.cachedTag = tag;
    return tag;
  }

  /** Gera o link de afiliado para uma URL de produto. */
  async generate(productUrl: string): Promise<GeneratedLink> {
    const tag = process.env.AFFILIATE_TAG || (await this.activeTag());

    const { status, body } = await this.sameOrigin<{
      short_url?: string;
      long_url?: string;
      origin_url?: string;
      tag?: string;
      urls?: { short_url?: string; long_url?: string; origin_url?: string; tag?: string }[];
    }>('/affiliate-program/api/v2/stripe/user/links', {
      method: 'POST',
      body: { url: productUrl, tag },
    });

    if (status === 401 || status === 403) {
      throw new AffiliateBotError('AUTH_REQUIRED', 'Sessao da Central de Afiliados expirada');
    }
    if (status === 429) {
      throw new AffiliateBotError('RATE_LIMITED', 'Central de Afiliados limitou as requisicoes');
    }
    if (status >= 500) {
      throw new AffiliateBotError('UNAVAILABLE', `Central respondeu ${status}`);
    }

    // A Central ja devolveu tanto o objeto direto quanto uma lista `urls`.
    const entry = body?.urls?.[0] ?? body ?? {};
    const url = entry.short_url ?? entry.long_url;

    if (!url) {
      throw new AffiliateBotError('INVALID_RESPONSE', 'Resposta sem short_url nem long_url');
    }

    return {
      url,
      originUrl: entry.origin_url ?? productUrl,
      tag: entry.tag ?? tag,
    };
  }
}
