import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Paginated } from '../../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ImportProductDto } from './dto/import-product.dto';
import { ListProductsQueryDto } from './dto/list-products.dto';
import { PriceHistoryQueryDto } from './dto/price-history.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductView } from './product.entity';
import { ProductService } from './product.service';
import {
  BatchSyncReport,
  ProductSyncService,
  SyncResult,
} from './product-sync.service';
import {
  DEFAULT_HISTORY_LIMIT,
  PriceSnapshotService,
  PriceSnapshotView,
} from './price-snapshot.service';

@Controller('products')
export class ProductController {
  constructor(
    private readonly products: ProductService,
    private readonly sync: ProductSyncService,
    private readonly snapshots: PriceSnapshotService,
  ) {}

  @Get()
  list(@Query() query: ListProductsQueryDto): Promise<Paginated<ProductView>> {
    return this.products.list(query);
  }

  @Post()
  create(@Body() dto: CreateProductDto): Promise<ProductView> {
    return this.products.create(dto);
  }

  /** Importa um anuncio real do Mercado Livre. Idempotente por marketplaceItemId. */
  @Post('import')
  import(@Body() dto: ImportProductDto): Promise<SyncResult> {
    return this.sync.importByItemId(dto.marketplaceItemId);
  }

  /** Sincroniza todos os produtos ativos. Falha de um item nao aborta o lote. */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  syncActive(): Promise<BatchSyncReport> {
    return this.sync.syncActive();
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<ProductView> {
    return this.products.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductView> {
    return this.products.update(id, dto);
  }

  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  syncOne(@Param('id', ParseUUIDPipe) id: string): Promise<SyncResult> {
    return this.sync.syncById(id);
  }

  /** Historico de precos, do mais recente para o mais antigo. */
  @Get(':id/prices')
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PriceHistoryQueryDto,
  ): Promise<PriceSnapshotView[]> {
    // Garante 404 consistente para produto inexistente.
    await this.products.findById(id);

    return this.snapshots.history(id, query.limit ?? DEFAULT_HISTORY_LIMIT);
  }
}
