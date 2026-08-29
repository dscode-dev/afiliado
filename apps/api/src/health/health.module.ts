import { Module } from '@nestjs/common';
import { AffiliateModule } from '../modules/affiliate/affiliate.module';
import { HealthController } from './health.controller';

@Module({
  imports: [AffiliateModule],
  controllers: [HealthController],
})
export class HealthModule {}
