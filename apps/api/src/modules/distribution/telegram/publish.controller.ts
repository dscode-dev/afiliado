import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PublishOfferDto } from '../dto/publish-offer.dto';
import { PublishResult, TelegramPublisherService } from './telegram-publisher.service';

/**
 * Publicacao explicita, disparada pelo operador. Nao ha scheduler neste PR.
 */
@Controller('offers')
export class PublishController {
  constructor(private readonly publisher: TelegramPublisherService) {}

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @Param('id', ParseUUIDPipe) offerId: string,
    @Body() dto: PublishOfferDto,
  ): Promise<PublishResult> {
    return this.publisher.publish(offerId, dto.channelId);
  }

  /** Publica em todos os canais Telegram ativos; uma falha nao aborta as demais. */
  @Post(':id/publish-all')
  @HttpCode(HttpStatus.OK)
  publishAll(@Param('id', ParseUUIDPipe) offerId: string) {
    return this.publisher.publishToAllTelegramChannels(offerId);
  }
}
