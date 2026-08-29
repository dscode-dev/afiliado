import { Module } from '@nestjs/common';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { OpportunityModule } from '../opportunity/opportunity.module';
import { PopularityService } from './popularity.service';
import { PriceSnapshotService } from './price-snapshot.service';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductSyncService } from './product-sync.service';

@Module({
  imports: [MarketplaceModule, OpportunityModule],
  controllers: [ProductController],
  providers: [ProductService, ProductSyncService, PriceSnapshotService, PopularityService],
  exports: [ProductService, ProductSyncService, PopularityService],
})
export class CatalogModule {}
