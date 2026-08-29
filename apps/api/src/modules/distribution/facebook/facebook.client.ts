import { Injectable, Logger } from '@nestjs/common';
import { FacebookConfig } from './facebook.config';
import { FacebookError, FacebookFailure, classify, isSafeToRetry } from './facebook.errors';

interface GraphError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface GraphResponse {
  /** `/feed` devolve o id do post; `/photos` devolve id da foto + post_id. */
  id?: string;
  post_id?: string;
  name?: string;
  error?: GraphError;
}

export interface PublishedPost {
  postId: string;
}

export interface PageInfo {
  id: string;
  name: string | null;
}

const MAX_ATTEMPTS = 2;

/**
 * Client da Graph API oficial da Meta, restrito ao que a aplicacao usa.
 *
 * Endpoints (confirmados na documentacao oficial):
 *   POST /{page-id}/feed    - post de texto com link
 *   POST /{page-id}/photos  - post com imagem remota (`url`) e `caption`
 *   GET  /{page-id}         - validacao da Page, sem criar post
 *
 * Toda falha vira `FacebookError`; o payload bruto da Meta nunca sai daqui, e
 * o token nunca entra em log nem em mensagem de erro.
 */
@Injectable()
export class FacebookClient {
  private readonly logger = new Logger(FacebookClient.name);

  constructor(private readonly config: FacebookConfig) {}

  get isConfigured(): boolean {
    return this.config.isConfigured;
  }

  /** GET /{page-id} - confirma que o token enxerga a Page. Nao publica nada. */
  async getPage(pageId: string): Promise<PageInfo> {
    const payload = await this.call(
      'get_page',
      `${encodeURIComponent(pageId)}?fields=id,name`,
      undefined,
    );

    return { id: String(payload.id ?? pageId), name: payload.name ?? null };
  }

  /** POST /{page-id}/feed - publicacao textual com link. */
  async publishPost(pageId: string, message: string, link: string): Promise<PublishedPost> {
    const payload = await this.call('publish_post', `${encodeURIComponent(pageId)}/feed`, {
      message,
      link,
    });

    return { postId: String(payload.id ?? '') };
  }

  /** POST /{page-id}/photos - publicacao com imagem remota e legenda. */
  async publishPhoto(pageId: string, imageUrl: string, caption: string): Promise<PublishedPost> {
    const payload = await this.call('publish_photo', `${encodeURIComponent(pageId)}/photos`, {
      url: imageUrl,
      caption,
    });

    // `post_id` e o id do post na Page; `id` sozinho e apenas a foto.
    return { postId: String(payload.post_id ?? payload.id ?? '') };
  }

  private async call(
    operation: string,
    path: string,
    body: Record<string, string> | undefined,
  ): Promise<GraphResponse> {
    if (!this.config.isConfigured) {
      throw new FacebookError('unauthorized', operation);
    }

    let lastError: FacebookError | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.execute(operation, path, body);
      } catch (error) {
        if (!(error instanceof FacebookError) || !isSafeToRetry(error.failure)) {
          throw error;
        }

        lastError = error;

        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError;
  }

  private async execute(
    operation: string,
    path: string,
    body: Record<string, string> | undefined,
  ): Promise<GraphResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    // O token vai no corpo (POST) ou na query (GET); a URL montada com token
    // NUNCA e logada.
    const isPost = body !== undefined;
    const url = isPost
      ? this.config.endpoint(path)
      : `${this.config.endpoint(path)}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(this.config.token())}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: isPost ? 'POST' : 'GET',
        headers: isPost ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
        body: isPost
          ? new URLSearchParams({ ...body, access_token: this.config.token() })
          : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      // A requisicao ja pode ter chegado a Meta: resultado ambiguo, sem retry.
      const failure: FacebookFailure = controller.signal.aborted ? 'unknown_outcome' : 'unavailable';
      this.fail(failure, operation, undefined, undefined, error);
    } finally {
      clearTimeout(timer);
    }

    let payload: GraphResponse;
    try {
      payload = (await response.json()) as GraphResponse;
    } catch {
      this.fail('unavailable', operation, response.status);
    }

    if (!response.ok || payload.error) {
      const graphError = payload.error;
      this.fail(
        classify(response.status, graphError?.code, graphError?.error_subcode, graphError?.message),
        operation,
        response.status,
        graphError?.code,
      );
    }

    return payload;
  }

  private fail(
    failure: FacebookFailure,
    operation: string,
    upstreamStatus?: number,
    upstreamCode?: number,
    cause?: unknown,
  ): never {
    const error = new FacebookError(failure, operation, upstreamStatus, upstreamCode);

    // Sem token, sem URL (a URL de GET carrega o token) e sem corpo bruto.
    this.logger.error(
      JSON.stringify(error.logContext),
      cause instanceof Error ? cause.name : undefined,
    );

    throw error;
  }
}
