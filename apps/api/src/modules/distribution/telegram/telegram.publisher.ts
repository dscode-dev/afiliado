import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import {
  ChannelPublisher,
  DeliveryResult,
  DestinationCheck,
  OfferContent,
} from '../publish/channel-publisher';
import { renderOfferMessage } from './message.renderer';
import { TelegramClient } from './telegram.client';
import { TelegramError } from './telegram.errors';

/**
 * Destino Telegram. Renderiza a mensagem e entrega pela Bot API.
 *
 * Toda a orquestracao comum (validacao da oferta, Publication, retry) fica no
 * PublicationDispatcher.
 */
@Injectable()
export class TelegramPublisher implements ChannelPublisher {
  readonly type = ChannelType.TELEGRAM;

  private readonly logger = new Logger(TelegramPublisher.name);

  constructor(private readonly client: TelegramClient) {}

  async validateDestination(destination: string): Promise<DestinationCheck> {
    const chat = await this.client.getChat(destination);

    return { id: chat.id, name: chat.title };
  }

  /**
   * Tenta com imagem e cai para texto apenas quando a falha e atribuivel a
   * midia. Qualquer outro erro sobe sem mascarar.
   */
  async deliver(destination: string, content: OfferContent): Promise<DeliveryResult> {
    const text = renderOfferMessage({
      title: content.title,
      price: content.price,
      originalPrice: content.originalPrice,
      discountPercentage: content.discountPercentage,
      affiliateUrl: content.affiliateUrl,
      highlights: content.highlights,
    });

    if (!content.imageUrl) {
      const sent = await this.client.sendMessage(destination, text);
      return { externalId: sent.messageId, usedImage: false };
    }

    try {
      const sent = await this.client.sendPhoto(destination, content.imageUrl, text);
      return { externalId: sent.messageId, usedImage: true };
    } catch (error) {
      if (!(error instanceof TelegramError) || error.failure !== 'invalid_media') {
        throw error;
      }

      this.logger.warn(
        JSON.stringify({ provider: 'telegram', operation: 'publish', fallback: 'send_message' }),
      );

      const sent = await this.client.sendMessage(destination, text);
      return { externalId: sent.messageId, usedImage: false };
    }
  }
}
