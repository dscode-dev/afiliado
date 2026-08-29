import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { PublicationController } from './publication.controller';
import { PublicationService } from './publication.service';
import { FacebookClient } from './facebook/facebook.client';
import { FacebookConfig } from './facebook/facebook.config';
import { FacebookPublisher } from './facebook/facebook.publisher';
import { CHANNEL_PUBLISHERS, ChannelPublisher } from './publish/channel-publisher';
import { ManualDistributionController } from './manual/manual.controller';
import { ManualDistributionService } from './manual/manual-distribution.service';
import { PublicationDispatcher } from './publish/publication-dispatcher.service';
import { PublishController } from './publish/publish.controller';
import { TelegramClient } from './telegram/telegram.client';
import { TelegramConfig } from './telegram/telegram.config';
import { TelegramPublisher } from './telegram/telegram.publisher';

/**
 * Distribuicao.
 *
 * Destinos com API oficial (Telegram, Facebook) implementam `ChannelPublisher`
 * e publicam sozinhos. O WhatsApp nao tem API oficial de Canais, entao opera
 * no modo semiassistido: o sistema prepara o conteudo e registra o resultado.
 */
@Module({
  controllers: [
    ChannelController,
    PublicationController,
    PublishController,
    ManualDistributionController,
  ],
  providers: [
    ChannelService,
    PublicationService,
    // Factory explicita: a config le process.env, nao dependencias injetadas.
    { provide: TelegramConfig, useFactory: () => new TelegramConfig() },
    TelegramClient,
    TelegramPublisher,
    { provide: FacebookConfig, useFactory: () => new FacebookConfig() },
    FacebookClient,
    FacebookPublisher,
    {
      // Registrar um destino novo e adiciona-lo aqui: o dispatcher nao muda.
      provide: CHANNEL_PUBLISHERS,
      useFactory: (
        telegram: TelegramPublisher,
        facebook: FacebookPublisher,
      ): ChannelPublisher[] => [telegram, facebook],
      inject: [TelegramPublisher, FacebookPublisher],
    },
    PublicationDispatcher,
    ManualDistributionService,
  ],
  exports: [PublicationDispatcher, ManualDistributionService],
})
export class DistributionModule {}
