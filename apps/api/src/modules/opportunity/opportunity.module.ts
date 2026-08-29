import { Module } from '@nestjs/common';
import { OfferController } from './offer.controller';
import { OfferService } from './offer.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityQueryService } from './opportunity-query.service';
import { OpportunityService } from './opportunity.service';

@Module({
  controllers: [OfferController, OpportunityController],
  providers: [OfferService, OpportunityService, OpportunityQueryService],
  exports: [OpportunityService],
})
export class OpportunityModule {}
