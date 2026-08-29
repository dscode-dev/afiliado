import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { PublicationController } from './publication.controller';
import { PublicationService } from './publication.service';
import { PublishController } from './telegram/publish.controller';
import { TelegramClient } from './telegram/telegram.client';
import { TelegramConfig } from './telegram/telegram.config';
import { TelegramPublisherService } from './telegram/telegram-publisher.service';

/**
 * Distribuicao. Nesta versao existe apenas Telegram - nao ha abstracao
 * multi-provider porque nao ha segundo provider.
 */
@Module({
  controllers: [ChannelController, PublicationController, PublishController],
  providers: [
    ChannelService,
    PublicationService,
    // Factory explicita: a config le process.env, nao dependencias injetadas.
    { provide: TelegramConfig, useFactory: () => new TelegramConfig() },
    TelegramClient,
    TelegramPublisherService,
  ],
  exports: [TelegramPublisherService],
})
export class DistributionModule {}
