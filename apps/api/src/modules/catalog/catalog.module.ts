import { Module } from '@nestjs/common';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { PriceSnapshotService } from './price-snapshot.service';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductSyncService } from './product-sync.service';

@Module({
  imports: [MarketplaceModule],
  controllers: [ProductController],
  providers: [ProductService, ProductSyncService, PriceSnapshotService],
  exports: [ProductService],
})
export class CatalogModule {}
