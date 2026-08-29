import {
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ChannelType, Prisma, PublicationStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { toMoneyString } from '../../../common/money';
import { OfferContent } from '../publish/channel-publisher';
import { PublicationDispatcher } from '../publish/publication-dispatcher.service';
import { PublicationView, toPublicationView } from '../publication.entity';
import { renderWhatsAppMessage } from '../whatsapp/message.renderer';

export interface ManualPreview {
  offerId: string;
  channelId: string;
  channelName: string;
  provider: ChannelType;
  productTitle: string;
  /** Texto pronto para o operador copiar e colar no canal. */
  text: string;
  affiliateUrl: string;
  imageUrl: string | null;
  price: string;
  /** Verdadeiro quando esta oferta ja foi marcada como publicada neste canal. */
  alreadyPublished: boolean;
  publishedAt: string | null;
}

export interface ManualPublicationResult {
  publication: PublicationView;
  provider: ChannelType;
}

/**
 * Renderers dos canais sem automacao oficial.
 *
 * Hoje so o WhatsApp: a Meta nao oferece API para publicar em Canais do
 * WhatsApp (ver README), e automatizar por fora seria browser automation -
 * proibido e passivel de bloqueio da conta.
 */
const MANUAL_RENDERERS: Partial<Record<ChannelType, (content: OfferContent) => string>> = {
  [ChannelType.WHATSAPP]: (content) =>
    renderWhatsAppMessage({
      title: content.title,
      price: content.price,
      originalPrice: content.originalPrice,
      discountPercentage: content.discountPercentage,
      affiliateUrl: content.affiliateUrl,
      highlights: content.highlights,
    }),
};

/**
 * Distribuicao semiassistida.
 *
 * O sistema prepara o conteudo e registra o resultado; quem publica e o
 * operador, dentro do proprio WhatsApp. Nada e enviado para fora daqui.
 *
 * A elegibilidade e exatamente a mesma do fluxo automatico - reutiliza
 * `PublicationDispatcher.prepareContent`, entao as regras nao podem divergir.
 */
@Injectable()
export class ManualDistributionService {
  private readonly logger = new Logger(ManualDistributionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: PublicationDispatcher,
  ) {}

  /** Tipos de canal que operam no modo manual. */
  get manualTypes(): ChannelType[] {
    return (Object.keys(MANUAL_RENDERERS) as ChannelType[]).filter(
      (type) => !this.dispatcher.publisherFor(type),
    );
  }

  /**
   * Gera o preview. Operacao de leitura: nao cria Publication nem altera nada.
   */
  async preview(offerId: string, channelId: string): Promise<ManualPreview> {
    const { channel, content } = await this.dispatcher.prepareContent(offerId, channelId);
    const render = this.assertManualChannel(channel.type);

    const existing = await this.prisma.publication.findUnique({
      where: { offerId_channelId: { offerId, channelId } },
    });

    return {
      offerId,
      channelId,
      channelName: channel.name,
      provider: channel.type,
      productTitle: content.title,
      text: render(content),
      affiliateUrl: content.affiliateUrl,
      imageUrl: content.imageUrl,
      price: toMoneyString(content.price) as string,
      alreadyPublished: existing?.status === PublicationStatus.PUBLISHED,
      publishedAt: existing?.publishedAt?.toISOString() ?? null,
    };
  }

  /**
   * Registra que o operador publicou manualmente.
   *
   * `externalMessageId` fica NULL: o WhatsApp nao expoe um id de post
   * acessivel a nos. A idempotencia continua sendo a constraint
   * `(offerId, channelId)` - marcar duas vezes e recusado.
   */
  async confirmPublication(
    offerId: string,
    channelId: string,
  ): Promise<ManualPublicationResult> {
    const { channel } = await this.dispatcher.prepareContent(offerId, channelId);
    this.assertManualChannel(channel.type);

    try {
      const publication = await this.prisma.publication.create({
        data: {
          offerId,
          channelId,
          status: PublicationStatus.PUBLISHED,
          publishedAt: new Date(),
          // Sem id externo: o WhatsApp nao nos devolve um.
          externalMessageId: null,
        },
        include: { channel: true, offer: { include: { product: true } } },
      });

      this.logger.log(
        JSON.stringify({
          provider: channel.type.toLowerCase(),
          mode: 'manual',
          operation: 'confirm_publication',
          offerId,
          channelId,
        }),
      );

      return { publication: toPublicationView(publication), provider: channel.type };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta oferta ja foi registrada como publicada neste canal');
      }

      throw error;
    }
  }

  private assertManualChannel(type: ChannelType): (content: OfferContent) => string {
    // Um canal com automacao oficial nao pode ser marcado como publicado a mao:
    // isso mascararia o resultado real da integracao.
    if (this.dispatcher.publisherFor(type)) {
      throw new UnprocessableEntityException(
        `Canais do tipo ${type} publicam automaticamente - use a publicacao normal`,
      );
    }

    const render = MANUAL_RENDERERS[type];

    if (!render) {
      throw new UnprocessableEntityException(
        `Canal do tipo ${type} nao possui fluxo de publicacao nesta versao`,
      );
    }

    return render;
  }
}
