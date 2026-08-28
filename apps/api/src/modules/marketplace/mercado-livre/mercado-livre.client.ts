import { Injectable, Logger } from '@nestjs/common';
import { MercadoLivreConfig } from './mercado-livre.config';
import { MercadoLivreError, MarketplaceFailure, isTransient } from './mercado-livre.errors';
import { MercadoLivreTokenService } from './mercado-livre-token.service';
import {
  MeliCatalogProduct,
  MeliCategory,
  MeliHighlights,
  MeliItem,
  MeliMultiGetEntry,
  MeliPrices,
} from './mercado-livre.types';

/** Uma unica retentativa, e apenas para falhas transitorias seguras (GET). */
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 300;

/** O multiget oficial de itens aceita no maximo 20 ids por chamada. */
export const MULTIGET_LIMIT = 20;

/** IDs do Mercado Livre no site MLB: prefixo do site + digitos. */
export const MLB_ID_PATTERN = /^MLB\d{4,}$/;
export const MLB_CATEGORY_PATTERN = /^MLB\d{3,}$/;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Client HTTP explicito para a API oficial do Mercado Livre.
 *
 * Nao e um SDK generico: expoe somente as operacoes que a aplicacao usa hoje.
 * Toda falha vira `MercadoLivreError` - a resposta bruta do provider nunca sai daqui.
 */
@Injectable()
export class MercadoLivreClient {
  private readonly logger = new Logger(MercadoLivreClient.name);

  constructor(
    private readonly config: MercadoLivreConfig,
    private readonly tokens: MercadoLivreTokenService,
  ) {}

  get siteId(): string {
    return this.config.siteId;
  }

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  /** GET /items/:itemId - dados do anuncio. */
  getItem(itemId: string): Promise<MeliItem> {
    return this.get<MeliItem>(`/items/${encodeURIComponent(itemId)}`, 'get_item', itemId);
  }

  /**
   * GET /items?ids=... - multiget usado para resolver highlights em uma chamada.
   * Itens que falharem individualmente sao omitidos, nao derrubam a operacao.
   */
  async getItems(itemIds: string[], attributes?: string[]): Promise<MeliItem[]> {
    if (itemIds.length === 0) return [];

    const params = new URLSearchParams({ ids: itemIds.slice(0, MULTIGET_LIMIT).join(',') });
    if (attributes?.length) {
      params.set('attributes', attributes.join(','));
    }

    const entries = await this.get<MeliMultiGetEntry<MeliItem>[]>(
      `/items?${params.toString()}`,
      'get_items',
      itemIds.join(','),
    );

    if (!Array.isArray(entries)) return [];

    return entries
      .filter((entry) => entry?.code === 200 && entry.body?.id)
      .map((entry) => entry.body as MeliItem);
  }

  /**
   * GET /items/:itemId/prices - fonte de verdade de preco.
   * Os campos de preco de `/items` sao legados e nao sao usados para gravar valor.
   */
  getItemPrices(itemId: string): Promise<MeliPrices> {
    return this.get<MeliPrices>(
      `/items/${encodeURIComponent(itemId)}/prices`,
      'get_item_prices',
      itemId,
    );
  }

  /** GET /categories/:categoryId - usado apenas para resolver o nome da categoria. */
  getCategory(categoryId: string): Promise<MeliCategory> {
    return this.get<MeliCategory>(
      `/categories/${encodeURIComponent(categoryId)}`,
      'get_category',
      categoryId,
    );
  }

  /** GET /highlights/:siteId/category/:categoryId - ate 20 mais vendidos. */
  getCategoryHighlights(categoryId: string): Promise<MeliHighlights> {
    return this.get<MeliHighlights>(
      `/highlights/${this.config.siteId}/category/${encodeURIComponent(categoryId)}`,
      'get_category_highlights',
      categoryId,
    );
  }

  /** GET /products/:productId - resolve entradas de highlight do tipo PRODUCT. */
  getCatalogProduct(productId: string): Promise<MeliCatalogProduct> {
    return this.get<MeliCatalogProduct>(
      `/products/${encodeURIComponent(productId)}`,
      'get_catalog_product',
      productId,
    );
  }

  private async get<T>(path: string, operation: string, resourceId?: string): Promise<T> {
    let lastError: MercadoLivreError | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await this.execute<T>(path, operation, resourceId, attempt > 0);
      } catch (error) {
        if (!(error instanceof MercadoLivreError) || !isTransient(error.failure)) {
          throw error;
        }

        lastError = error;

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
        }
      }
    }

    throw lastError;
  }

  private async execute<T>(
    path: string,
    operation: string,
    resourceId: string | undefined,
    isRetry: boolean,
  ): Promise<T> {
    const token = await this.tokens.getAccessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (error) {
      const failure: MarketplaceFailure = controller.signal.aborted ? 'timeout' : 'unavailable';
      this.fail(failure, operation, resourceId, undefined, isRetry, error);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const failure = this.classify(response.status);

      // Token pode ter sido revogado antes de expirar: forca renovacao na proxima.
      if (failure === 'unauthorized') {
        this.tokens.invalidate();
      }

      this.fail(failure, operation, resourceId, response.status, isRetry);
    }

    try {
      return (await response.json()) as T;
    } catch {
      this.fail('unavailable', operation, resourceId, response.status, isRetry);
    }
  }

  /**
   * O Mercado Livre responde 403 (PolicyAgent) quando falta token valido,
   * entao 401 e 403 sao tratados como o mesmo problema de credencial.
   */
  private classify(status: number): MarketplaceFailure {
    if (status === 401 || status === 403) return 'unauthorized';
    if (status === 404) return 'not_found';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'unavailable';
    return 'invalid_item';
  }

  private fail(
    failure: MarketplaceFailure,
    operation: string,
    resourceId: string | undefined,
    upstreamStatus: number | undefined,
    isRetry: boolean,
    cause?: unknown,
  ): never {
    const error = new MercadoLivreError(failure, operation, resourceId, upstreamStatus);

    this.logger.error(
      JSON.stringify({ ...error.logContext, retry: isRetry }),
      cause instanceof Error ? cause.message : undefined,
    );

    throw error;
  }
}
