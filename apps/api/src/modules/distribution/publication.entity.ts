import {
  Channel,
  ChannelType,
  Offer,
  Product,
  Publication,
  PublicationStatus,
} from '@prisma/client';
import { toMoneyString } from '../../common/money';

export interface PublicationView {
  id: string;
  offerId: string;
  channelId: string;
  channel: { id: string; name: string; type: ChannelType } | null;
  offer: {
    id: string;
    productId: string;
    status: string;
    price: string;
    productTitle: string | null;
  } | null;
  status: PublicationStatus;
  externalMessageId: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

type PublicationWithRelations = Publication & {
  channel?: Channel | null;
  offer?: (Offer & { product?: Product | null }) | null;
};

export function toPublicationView(publication: PublicationWithRelations): PublicationView {
  return {
    id: publication.id,
    offerId: publication.offerId,
    channelId: publication.channelId,
    channel: publication.channel
      ? {
          id: publication.channel.id,
          name: publication.channel.name,
          type: publication.channel.type,
        }
      : null,
    offer: publication.offer
      ? {
          id: publication.offer.id,
          productId: publication.offer.productId,
          status: publication.offer.status,
          price: toMoneyString(publication.offer.price) as string,
          productTitle: publication.offer.product?.title ?? null,
        }
      : null,
    status: publication.status,
    externalMessageId: publication.externalMessageId,
    scheduledAt: publication.scheduledAt?.toISOString() ?? null,
    publishedAt: publication.publishedAt?.toISOString() ?? null,
    errorMessage: publication.errorMessage,
    createdAt: publication.createdAt.toISOString(),
    updatedAt: publication.updatedAt.toISOString(),
  };
}
