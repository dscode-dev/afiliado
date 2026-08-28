import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Paginated, paginationArgs } from '../../common/dto/pagination.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { ListOffersQueryDto } from './dto/list-offers.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OfferView, toOfferView } from './offer.entity';

/**
 * Ofertas sao cadastradas manualmente neste PR. A deteccao automatica e o
 * Opportunity Score entram no PR do Opportunity Engine.
 */
@Injectable()
export class OfferService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListOffersQueryDto): Promise<Paginated<OfferView>> {
    const { take, skip } = paginationArgs(query);

    const where: Prisma.OfferWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        take,
        skip,
        orderBy: { detectedAt: 'desc' },
        include: { product: true },
      }),
      this.prisma.offer.count({ where }),
    ]);

    return { data: rows.map(toOfferView), total, take, skip };
  }

  async create(dto: CreateOfferDto): Promise<OfferView> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true },
    });

    if (!product) {
      throw new UnprocessableEntityException(`Produto ${dto.productId} nao encontrado`);
    }

    const offer = await this.prisma.offer.create({
      data: {
        productId: dto.productId,
        price: new Prisma.Decimal(dto.price),
        originalPrice: dto.originalPrice ? new Prisma.Decimal(dto.originalPrice) : null,
        discountPercentage: dto.discountPercentage
          ? new Prisma.Decimal(dto.discountPercentage)
          : null,
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.detectedAt === undefined ? {} : { detectedAt: new Date(dto.detectedAt) }),
      },
      include: { product: true },
    });

    return toOfferView(offer);
  }

  async update(id: string, dto: UpdateOfferDto): Promise<OfferView> {
    const exists = await this.prisma.offer.findUnique({ where: { id }, select: { id: true } });

    if (!exists) {
      throw new NotFoundException(`Oferta ${id} nao encontrada`);
    }

    const offer = await this.prisma.offer.update({
      where: { id },
      data: {
        ...(dto.price === undefined ? {} : { price: new Prisma.Decimal(dto.price) }),
        ...(dto.originalPrice === undefined
          ? {}
          : { originalPrice: new Prisma.Decimal(dto.originalPrice) }),
        ...(dto.discountPercentage === undefined
          ? {}
          : { discountPercentage: new Prisma.Decimal(dto.discountPercentage) }),
        ...(dto.status === undefined ? {} : { status: dto.status }),
        ...(dto.detectedAt === undefined ? {} : { detectedAt: new Date(dto.detectedAt) }),
      },
      include: { product: true },
    });

    return toOfferView(offer);
  }
}
