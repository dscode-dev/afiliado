import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ChannelType, Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPublishable, resolveEffectiveStatus } from '../../opportunity/effective-status';
import { Breakdown } from '../../opportunity/scoring/evaluator';
import { PublicationView, toPublicationView } from '../publication.entity';
import { SentMessage, TelegramClient } from './telegram.client';
import { TelegramError } from './telegram.errors';
import { OfferHighlights, renderOfferMessage } from './message.renderer';

export interface PublishResult {
  publication: PublicationView;
  /** Falso quando a Offer ja estava publicada neste canal (nada foi enviado). */
  delivered: boolean;
  usedPhoto: boolean;
}

/** priceHistory >= este valor significa "no piso ou praticamente no piso". */
const NEAR_LOWEST_THRESHOLD = 22;

@Injectable()
export class TelegramPublisherService {
  private readonly logger = new Logger(TelegramPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramClient,
  ) {}

  /**
   * Publica uma Offer em um canal do Telegram.
   *
   * Idempotente por `(offerId, channelId)`: a reserva da Publication e um
   * INSERT protegido por UNIQUE, entao chamadas concorrentes resultam em no
   * maximo uma chamada externa.
   */
  async publish(offerId: string, channelId: string): Promise<PublishResult> {
    const { offer, channel, affiliateUrl, highlights } = await this.loadAndValidate(
      offerId,
      channelId,
    );

    const publication = await this.reserve(offerId, channelId);

    const text = renderOfferMessage({
      title: offer.product.title,
      price: offer.price,
      originalPrice: offer.originalPrice,
      discountPercentage: offer.discountPercentage,
      affiliateUrl,
      highlights,
    });

    const destination = channel.externalIdentifier as string;
    let sent: SentMessage;
    let usedPhoto = false;

    try {
      ({ sent, usedPhoto } = await this.deliver(destination, offer.product.imageUrl, text));
    } catch (error) {
      await this.markFailed(publication.id, error);
      throw error;
    }

    const published = await this.prisma.publication.update({
      where: { id: publication.id },
      data: {
        status: PublicationStatus.PUBLISHED,
        externalMessageId: sent.messageId,
        publishedAt: new Date(),
        errorMessage: null,
      },
      include: { channel: true, offer: { include: { product: true } } },
    });

    this.logger.log(
      JSON.stringify({
        provider: 'telegram',
        operation: 'publish',
        offerId,
        channelId,
        usedPhoto,
        externalMessageId: sent.messageId,
      }),
    );

    return { publication: toPublicationView(published), delivered: true, usedPhoto };
  }

  /** Publica em todos os canais Telegram ativos. Uma falha nao aborta as demais. */
  async publishToAllTelegramChannels(offerId: string): Promise<{
    total: number;
    published: number;
    skipped: number;
    failed: number;
    results: { channelId: string; channelName: string; status: string; error?: string }[];
  }> {
    const channels = await this.prisma.channel.findMany({
      where: { type: ChannelType.TELEGRAM, active: true, externalIdentifier: { not: null } },
      orderBy: { createdAt: 'asc' },
    });

    const report = {
      total: channels.length,
      published: 0,
      skipped: 0,
      failed: 0,
      results: [] as { channelId: string; channelName: string; status: string; error?: string }[],
    };

    for (const channel of channels) {
      try {
        const result = await this.publish(offerId, channel.id);

        if (result.delivered) report.published += 1;
        else report.skipped += 1;

        report.results.push({
          channelId: channel.id,
          channelName: channel.name,
          status: result.delivered ? 'PUBLISHED' : 'ALREADY_PUBLISHED',
        });
      } catch (error) {
        report.failed += 1;
        report.results.push({
          channelId: channel.id,
          channelName: channel.name,
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Erro inesperado',
        });
      }
    }

    return report;
  }

  /**
   * Reprocessa uma Publication FAILED, reaproveitando o mesmo registro.
   *
   * Reusar a linha (em vez de criar outra) mantem a constraint
   * `(offerId, channelId)` valida e preserva o historico da tentativa.
   */
  async retry(publicationId: string): Promise<PublishResult> {
    const publication = await this.prisma.publication.findUnique({
      where: { id: publicationId },
    });

    if (!publication) {
      throw new NotFoundException(`Publicacao ${publicationId} nao encontrada`);
    }

    if (publication.status !== PublicationStatus.FAILED) {
      throw new ConflictException(
        `Somente publicacoes FAILED podem ser reenviadas (atual: ${publication.status})`,
      );
    }

    // Volta para PENDING antes de tentar de novo, para que o estado nunca minta.
    await this.prisma.publication.update({
      where: { id: publicationId },
      data: { status: PublicationStatus.PENDING, errorMessage: null },
    });

    return this.publish(publication.offerId, publication.channelId);
  }

  /** Valida o canal sem publicar nada - a acao "Testar canal" nao gera spam. */
  async testChannel(channelId: string): Promise<{ ok: true; chat: { id: string; title: string | null } }> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });

    if (!channel) throw new NotFoundException(`Canal ${channelId} nao encontrado`);

    this.assertTelegramChannel(channel);

    const chat = await this.telegram.getChat(channel.externalIdentifier as string);

    return { ok: true, chat: { id: chat.id, title: chat.title } };
  }

  /**
   * Tenta com imagem e cai para texto apenas quando a falha e atribuivel a
   * midia. Qualquer outro erro sobe sem mascarar.
   */
  private async deliver(
    destination: string,
    imageUrl: string | null,
    text: string,
  ): Promise<{ sent: SentMessage; usedPhoto: boolean }> {
    if (!imageUrl) {
      return { sent: await this.telegram.sendMessage(destination, text), usedPhoto: false };
    }

    try {
      return { sent: await this.telegram.sendPhoto(destination, imageUrl, text), usedPhoto: true };
    } catch (error) {
      if (!(error instanceof TelegramError) || error.failure !== 'invalid_media') {
        throw error;
      }

      this.logger.warn(
        JSON.stringify({ provider: 'telegram', operation: 'publish', fallback: 'send_message' }),
      );

      return { sent: await this.telegram.sendMessage(destination, text), usedPhoto: false };
    }
  }

  /**
   * Reserva a Publication. O UNIQUE `(offerId, channelId)` faz o trabalho
   * pesado: dois chamadores simultaneos disputam o mesmo INSERT e apenas um
   * segue para o Telegram.
   */
  private async reserve(
    offerId: string,
    channelId: string,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.publication.findUnique({
      where: { offerId_channelId: { offerId, channelId } },
    });

    if (existing) {
      if (existing.status === PublicationStatus.PENDING) {
        return { id: existing.id };
      }

      throw new ConflictException(
        existing.status === PublicationStatus.PUBLISHED
          ? 'Esta oferta ja foi publicada neste canal'
          : `Ja existe uma publicacao ${existing.status} desta oferta neste canal`,
      );
    }

    try {
      return await this.prisma.publication.create({
        data: { offerId, channelId, status: PublicationStatus.PENDING },
        select: { id: true },
      });
    } catch (error) {
      // Corrida perdida: outro chamador reservou primeiro.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Esta oferta ja esta sendo publicada neste canal');
      }

      throw error;
    }
  }

  /** Mensagem de erro sanitizada: nunca token, nunca corpo bruto do Telegram. */
  private async markFailed(publicationId: string, error: unknown): Promise<void> {
    const message =
      error instanceof TelegramError
        ? `${error.failure}: ${error.message}`
        : 'Erro inesperado ao publicar';

    await this.prisma.publication.update({
      where: { id: publicationId },
      data: {
        status: PublicationStatus.FAILED,
        errorMessage: message.slice(0, 1000),
      },
    });
  }

  private async loadAndValidate(offerId: string, channelId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        product: {
          include: {
            evaluation: true,
            affiliateLinks: { where: { active: true }, take: 1, orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });

    if (!offer) throw new NotFoundException(`Oferta ${offerId} nao encontrada`);

    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });

    if (!channel) throw new NotFoundException(`Canal ${channelId} nao encontrado`);

    this.assertTelegramChannel(channel);

    // Regra absoluta: sem link afiliado ativo nao existe publicacao.
    const link = offer.product.affiliateLinks[0];
    if (!link) {
      throw new UnprocessableEntityException(
        'Produto sem link de afiliado ativo - publicacao proibida',
      );
    }

    // A decisao vem do Opportunity Engine; distribution nao a reimplementa.
    const evaluation = offer.product.evaluation;
    if (!evaluation) {
      throw new UnprocessableEntityException(
        'Produto ainda nao avaliado pelo Opportunity Engine',
      );
    }

    const effective = resolveEffectiveStatus(evaluation.status, evaluation.operatorDecision);
    if (!isPublishable(effective)) {
      throw new UnprocessableEntityException(
        `Somente oportunidades APPROVED podem ser publicadas (atual: ${effective})`,
      );
    }

    return {
      offer,
      channel,
      affiliateUrl: link.url,
      highlights: toHighlights(evaluation.breakdown),
    };
  }

  private assertTelegramChannel(channel: {
    type: ChannelType;
    active: boolean;
    externalIdentifier: string | null;
  }): void {
    if (channel.type !== ChannelType.TELEGRAM) {
      throw new UnprocessableEntityException(
        `Canal do tipo ${channel.type} nao e suportado nesta versao`,
      );
    }
    if (!channel.active) {
      throw new UnprocessableEntityException('Canal inativo');
    }
    if (!channel.externalIdentifier) {
      throw new UnprocessableEntityException(
        'Canal sem externalIdentifier (ex.: @meu_canal)',
      );
    }
  }
}

/** Converte o breakdown do engine nas afirmacoes que a copy pode fazer. */
function toHighlights(breakdown: Prisma.JsonValue): OfferHighlights {
  const parsed = breakdown as unknown as Breakdown | null;

  return {
    amongBestSellers: (parsed?.popularity?.earned ?? 0) > 0,
    nearLowestTrackedPrice: (parsed?.priceHistory?.earned ?? 0) >= NEAR_LOWEST_THRESHOLD,
  };
}
