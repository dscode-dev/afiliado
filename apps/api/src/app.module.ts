import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { AffiliateModule } from './modules/affiliate/affiliate.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AutomationModule } from './modules/automation/automation.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DistributionModule } from './modules/distribution/distribution.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { OpportunityModule } from './modules/opportunity/opportunity.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // .env unico na raiz do monorepo, compartilhado por API e admin.
      // Caminhos relativos ao cwd (apps/api quando rodado via npm workspaces).
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    HealthModule,
    MarketplaceModule,
    CatalogModule,
    AffiliateModule,
    OpportunityModule,
    DistributionModule,
    AnalyticsModule,
    AutomationModule,
  ],
})
export class AppModule {}
