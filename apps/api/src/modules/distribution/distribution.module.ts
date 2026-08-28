import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { PublicationController } from './publication.controller';
import { PublicationService } from './publication.service';

@Module({
  controllers: [ChannelController, PublicationController],
  providers: [ChannelService, PublicationService],
})
export class DistributionModule {}
