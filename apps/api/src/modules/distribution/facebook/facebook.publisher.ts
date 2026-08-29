import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import {
  ChannelPublisher,
  DeliveryResult,
  DestinationCheck,
  OfferContent,
} from '../publish/channel-publisher';
import { FacebookClient } from './facebook.client';
import { FacebookError } from './facebook.errors';
import { renderFacebookPost } from './message.renderer';

/**
 * Destino Facebook Page. Renderiza o post e publica pela Graph API.
 *
 * Com imagem usa `/photos` (imagem + legenda); sem imagem, `/feed` (mensagem +
 * link). O fallback para texto acontece somente quando a falha e atribuivel a
 * midia - nunca mascara erro de permissao, token ou Page.
 */
@Injectable()
export class FacebookPublisher implements ChannelPublisher {
  readonly type = ChannelType.FACEBOOK;

  private readonly logger = new Logger(FacebookPublisher.name);

  constructor(private readonly client: FacebookClient) {}

  async validateDestination(destination: string): Promise<DestinationCheck> {
    const page = await this.client.getPage(destination);

    return { id: page.id, name: page.name };
  }

  async deliver(destination: string, content: OfferContent): Promise<DeliveryResult> {
    const message = renderFacebookPost({
      title: content.title,
      price: content.price,
      originalPrice: content.originalPrice,
      discountPercentage: content.discountPercentage,
      affiliateUrl: content.affiliateUrl,
      highlights: content.highlights,
    });

    if (!content.imageUrl) {
      const post = await this.client.publishPost(destination, message, content.affiliateUrl);
      return { externalId: post.postId, usedImage: false };
    }

    try {
      const post = await this.client.publishPhoto(destination, content.imageUrl, message);
      return { externalId: post.postId, usedImage: true };
    } catch (error) {
      if (!(error instanceof FacebookError) || error.failure !== 'invalid_media') {
        throw error;
      }

      this.logger.warn(
        JSON.stringify({ provider: 'facebook', operation: 'publish', fallback: 'feed_post' }),
      );

      const post = await this.client.publishPost(destination, message, content.affiliateUrl);
      return { externalId: post.postId, usedImage: false };
    }
  }
}
