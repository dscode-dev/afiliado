import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PublishOfferDto } from '../dto/publish-offer.dto';
import {
  PublicationDispatcher,
  PublishResult,
} from './publication-dispatcher.service';

/**
 * Publicacao explicita, disparada pelo operador, em qualquer canal suportado.
 */
@Controller('offers')
export class PublishController {
  constructor(private readonly publisher: PublicationDispatcher) {}

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('id', ParseUUIDPipe) offerId: string,
    @Body() dto: PublishOfferDto,
  ): Promise<PublishResult> {
    return this.publisher.publish(offerId, dto.channelId);
  }

  /** Publica em todos os canais ativos suportados; uma falha nao aborta as demais. */
  @Post(':id/publish-all')
  @HttpCode(HttpStatus.OK)
  publishAll(@Param('id', ParseUUIDPipe) offerId: string) {
    return this.publisher.publishToAllActiveChannels(offerId);
  }
}
