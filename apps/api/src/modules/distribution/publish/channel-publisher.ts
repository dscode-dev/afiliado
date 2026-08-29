import { ChannelType, Prisma } from '@prisma/client';
import { OfferHighlights } from '../telegram/message.renderer';

/**
 * Conteudo de dominio de uma oferta, ja validado e pronto para publicar.
 * Cada provider decide como renderizar - a superficie do Telegram e a do
 * Facebook nao pedem o mesmo formato.
 */
export interface OfferContent {
  title: string;
  price: Prisma.Decimal;
  originalPrice: Prisma.Decimal | null;
  discountPercentage: Prisma.Decimal | null;
  /** Sempre o link de afiliado. Nunca o permalink do produto. */
  affiliateUrl: string;
  imageUrl: string | null;
  highlights: OfferHighlights;
}

export interface DeliveryResult {
  /** Identificador do post no provider, salvo em Publication.externalMessageId. */
  externalId: string;
  usedImage: boolean;
}

export interface DestinationCheck {
  id: string;
  name: string | null;
}

/**
 * Contrato de um destino de publicacao.
 *
 * O que e comum a todos os canais (validar oferta, reservar Publication,
 * marcar PUBLISHED/FAILED, reenviar) vive no PublicationDispatcher. Aqui fica
 * somente o que e especifico do provider: renderizar e entregar.
 */
export interface ChannelPublisher {
  readonly type: ChannelType;

  /** Valida o destino sem publicar nada (usado pela acao "Testar canal"). */
  validateDestination(destination: string): Promise<DestinationCheck>;

  deliver(destination: string, content: OfferContent): Promise<DeliveryResult>;
}

/** Token de injecao: os publishers sao registrados como um array. */
export const CHANNEL_PUBLISHERS = Symbol('CHANNEL_PUBLISHERS');
