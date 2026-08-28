import { Module } from '@nestjs/common';
import { AffiliateLinkController } from './affiliate-link.controller';
import { AffiliateLinkService } from './affiliate-link.service';

@Module({
  controllers: [AffiliateLinkController],
  providers: [AffiliateLinkService],
})
export class AffiliateModule {}
