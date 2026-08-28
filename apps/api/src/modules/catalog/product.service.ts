import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Paginated, paginationArgs } from '../../common/dto/pagination.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductView, toProductView } from './product.entity';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductsQueryDto): Promise<Paginated<ProductView>> {
    const { take, skip } = paginationArgs(query);

    const where: Prisma.ProductWhereInput = {
      ...(query.active === undefined ? {} : { active: query.active }),
      ...(query.marketplace ? { marketplace: query.marketplace } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data: rows.map(toProductView), total, take, skip };
  }

  async findById(id: string): Promise<ProductView> {
    const product = await this.prisma.product.findUnique({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Produto ${id} nao encontrado`);
    }

    return toProductView(product);
  }

  async create(dto: CreateProductDto): Promise<ProductView> {
    const product = await this.prisma.product.create({
      data: {
        marketplace: dto.marketplace,
        marketplaceItemId: dto.marketplaceItemId,
        title: dto.title,
        category: dto.category ?? null,
        imageUrl: dto.imageUrl ?? null,
        currentPrice: new Prisma.Decimal(dto.currentPrice),
        originalPrice: dto.originalPrice ? new Prisma.Decimal(dto.originalPrice) : null,
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
    });

    return toProductView(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    await this.assertExists(id);

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.title === undefined ? {} : { title: dto.title }),
        ...(dto.category === undefined ? {} : { category: dto.category }),
        ...(dto.imageUrl === undefined ? {} : { imageUrl: dto.imageUrl }),
        ...(dto.currentPrice === undefined
          ? {}
          : { currentPrice: new Prisma.Decimal(dto.currentPrice) }),
        ...(dto.originalPrice === undefined
          ? {}
          : { originalPrice: new Prisma.Decimal(dto.originalPrice) }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
    });

    return toProductView(product);
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });

    if (!exists) {
      throw new NotFoundException(`Produto ${id} nao encontrado`);
    }
  }
}
