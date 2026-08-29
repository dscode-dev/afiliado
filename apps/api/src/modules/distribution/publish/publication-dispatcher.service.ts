import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Channel, ChannelType, Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isPublishable, resolveEffectiveStatus } from '../../opportunity/effective-status';
import { Breakdown } from '../../opportunity/scoring/evaluator';
import { OfferHighlights } from '../telegram/message.renderer';
import { PublicationView, toPublicationView } from '../publication.entity';
import {
  CHANNEL_PUBLISHERS,
  ChannelPublisher,
  DestinationCheck,
  OfferContent,
} from './channel-publisher';

export interface PublishResult {
  publication: PublicationView;
  /** Falso quando a Offer ja estava publicada neste canal (nada foi enviado). */
  delivered: boolean;
  usedPhoto: boolean;
  provider: ChannelType;
}

export interface PublishAllReport {
  total: number;
  published: number;
  skipped: number;
  failed: number;
  results: {
    channelId: string;
    channelName: string;
    provider: ChannelType;
    status: string;
    error?: string;
  }[];
}

/** priceHistory >= este valor significa "no piso ou praticamente no piso". */
const NEAR_LOWEST_THRESHOLD = 22;

/**
 * Orquestracao comum a todos os destinos de publicacao.
 *
 * Valida a oferta, reserva a Publication, delega a entrega ao publisher do
 * canal e registra o resultado. Adicionar um provider novo significa apenas
 * implementar `ChannelPublisher` - nada aqui muda.
 */
@Injectable()
export class PublicationDispatcher {
  private readonly logger = new Logger(PublicationDispatcher.name);
  private readonly publishers: Map<ChannelType, ChannelPublisher>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_PUBLISHERS) publishers: ChannelPublisher[],
  ) {
    this.publishers = new Map(publishers.map((publisher) => [publisher.type, publisher]));
  }

  /** Tipos de canal com publisher automatizado registrado. */
  get supportedTypes(): ChannelType[] {
    return [...this.publishers.keys()];
  }

  /** Publisher do tipo, quando existe automacao oficial para ele. */
  publisherFor(type: ChannelType): ChannelPublisher | undefined {
    return this.publishers.get(type);
  }

  /**
   * Valida a oferta e monta o conteudo, sem exigir publisher.
   *
   * Compartilhado com o fluxo manual (WhatsApp): as regras de elegibilidade
   * - AffiliateLink ativo e effectiveStatus APPROVED - sao exatamente as
   * mesmas, e nao podem divergir entre automatico e manual.
   */
  async prepareContent(
    offerId: string,
    channelId: string,
  ): Promise<{ channel: Channel; content: OfferContent }> {
    const { channel, content } = await this.loadAndValidate(offerId, channelId);

    return { channel, content };
  }

  /**
   * Publica uma Offer em um canal.
   *
   * Idempotente por `(offerId, channelId)`: a reserva da Publication e um
   * INSERT protegido por UNIQUE, entao chamadas concorrentes resultam em no
   * maximo uma entrega externa.
   */
  async publish(offerId: string, channelId: string): Promise<PublishResult> {
    const { channel, content } = await this.loadAndValidate(offerId, channelId);
    const publisher = this.assertAutomatedChannel(channel);
    const publication = await this.reserve(offerId, channelId);

    return this.deliverAndRecord(publication.id, channel, publisher, content);
  }

  /**
   * Entrega no provider e grava o resultado.
   *
   * So e chamado por quem ja detem a reserva daquela Publication - seja por ter
   * vencido o INSERT (publish) ou por ter reivindicado uma FAILED (retry).
   */
  private async deliverAndRecord(
    publicationId: string,
    channel: Channel,
    publisher: ChannelPublisher,
    content: OfferContent,
  ): Promise<PublishResult> {
    let delivery;
    try {
      delivery = await publisher.deliver(channel.externalIdentifier as string, content);
    } catch (error) {
      await this.markFailed(publicationId, channel.type, error);
      throw error;
    }

    const published = await this.prisma.publication.update({
      where: { id: publicationId },
      data: {
        status: PublicationStatus.PUBLISHED,
        externalMessageId: delivery.externalId,
        publishedAt: new Date(),
        errorMessage: null,
      },
      include: { channel: true, offer: { include: { product: true } } },
    });

    this.logger.log(
      JSON.stringify({
        provider: channel.type.toLowerCase(),
        operation: 'publish',
        offerId: published.offerId,
        channelId: published.channelId,
        usedImage: delivery.usedImage,
        externalMessageId: delivery.externalId,
      }),
    );

    return {
      publication: toPublicationView(published),
      delivered: true,
      usedPhoto: delivery.usedImage,
      provider: channel.type,
    };
  }

  /** Publica em todos os canais ativos com provider suportado. */
  async publishToAllActiveChannels(offerId: string): Promise<PublishAllReport> {
    const channels = await this.prisma.channel.findMany({
      where: {
        type: { in: this.supportedTypes },
        active: true,
        externalIdentifier: { not: null },
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });

    const report: PublishAllReport = {
      total: channels.length,
      published: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };

    // Sequencial: volume baixo, e uma falha nao pode contaminar os demais.
    for (const channel of channels) {
      try {
        const result = await this.publish(offerId, channel.id);

        if (result.delivered) report.published += 1;
        else report.skipped += 1;

        report.results.push({
          channelId: channel.id,
          channelName: channel.name,
          provider: channel.type,
          status: 'PUBLISHED',
        });
      } catch (error) {
        report.failed += 1;
        report.results.push({
          channelId: channel.id,
          channelName: channel.name,
          provider: channel.type,
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Erro inesperado',
        });
      }
    }

    return report;
  }

  /**
   * Reprocessa uma Publication FAILED, reaproveitando o mesmo registro -
   * o que mantem a constraint valida e preserva o historico da tentativa.
   * Funciona para qualquer provider, conforme o Channel da publicacao.
   */
  async retry(publicationId: string): Promise<PublishResult> {
    const publication = await this.prisma.publication.findUnique({
      where: { id: publicationId },
    });

    if (!publication) {
      throw new NotFoundException(`Publicacao ${publicationId} nao encontrada`);
    }

    // Reivindicacao atomica: a condicao `status: FAILED` no UPDATE garante que
    // apenas um reenvio concorrente assume a publicacao.
    const claimed = await this.prisma.publication.updateMany({
      where: { id: publicationId, status: PublicationStatus.FAILED },
      data: { status: PublicationStatus.PENDING, errorMessage: null },
    });

    if (claimed.count === 0) {
      throw new ConflictException(
        `Somente publicacoes FAILED podem ser reenviadas (atual: ${publication.status})`,
      );
    }

    const { channel, content } = await this.loadAndValidate(
      publication.offerId,
      publication.channelId,
    );
    const publisher = this.assertAutomatedChannel(channel);

    // Vai direto para a entrega: a reserva ja e desta chamada.
    return this.deliverAndRecord(publicationId, channel, publisher, content);
  }

  /** Valida o canal sem publicar nada. */
  async testChannel(
    channelId: string,
  ): Promise<{ ok: true; provider: ChannelType; destination: DestinationCheck }> {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });

    if (!channel) throw new NotFoundException(`Canal ${channelId} nao encontrado`);

    const publisher = this.assertAutomatedChannel(channel);
    const destination = await publisher.validateDestination(
      channel.externalIdentifier as string,
    );

    return { ok: true, provider: channel.type, destination };
  }

  private async reserve(offerId: string, channelId: string): Promise<{ id: string }> {
    const existing = await this.prisma.publication.findUnique({
      where: { offerId_channelId: { offerId, channelId } },
    });

    // Qualquer linha existente e conflito - inclusive PENDING.
    //
    // Retomar uma reserva PENDING alheia permitiria que chamadas concorrentes
    // entregassem a mesma oferta varias vezes ao provider, contornando a
    // constraint. Reenvio de uma FAILED passa por `retry`, que reivindica a
    // linha atomicamente.
    if (existing) {
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta oferta ja esta sendo publicada neste canal');
      }

      throw error;
    }
  }

  /** Mensagem sanitizada: nunca token, nunca corpo bruto do provider. */
  private async markFailed(
    publicationId: string,
    type: ChannelType,
    error: unknown,
  ): Promise<void> {
    const failure = (error as { failure?: string }).failure;
    const message =
      failure && error instanceof Error
        ? `${failure}: ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Erro inesperado ao publicar';

    this.logger.error(
      JSON.stringify({
        provider: type.toLowerCase(),
        operation: 'publish',
        failure: failure ?? 'unexpected_error',
      }),
    );

    await this.prisma.publication.update({
      where: { id: publicationId },
      data: { status: PublicationStatus.FAILED, errorMessage: message.slice(0, 1000) },
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

    this.assertChannelUsable(channel);

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

    const content: OfferContent = {
      title: offer.product.title,
      price: offer.price,
      originalPrice: offer.originalPrice,
      discountPercentage: offer.discountPercentage,
      affiliateUrl: link.url,
      imageUrl: offer.product.imageUrl,
      highlights: toHighlights(evaluation.breakdown),
    };

    return { offer, channel, content };
  }

  /** Regra valida para qualquer canal, automatizado ou manual. */
  private assertChannelUsable(channel: Channel): void {
    if (!channel.active) {
      throw new UnprocessableEntityException('Canal inativo');
    }
  }

  /**
   * Exige automacao oficial para o tipo do canal. O WhatsApp nao passa por
   * aqui: nao ha API oficial de Canais, entao ele usa o fluxo manual.
   */
  private assertAutomatedChannel(channel: Channel): ChannelPublisher {
    const publisher = this.publishers.get(channel.type);

    if (!publisher) {
      throw new UnprocessableEntityException(
        `Canal do tipo ${channel.type} nao possui publicacao automatica nesta versao`,
      );
    }

    this.assertChannelUsable(channel);

    if (!channel.externalIdentifier) {
      throw new UnprocessableEntityException(
        'Canal sem externalIdentifier (ex.: @meu_canal no Telegram, Page ID no Facebook)',
      );
    }

    return publisher;
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
