import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Paginated, paginationArgs } from '../../common/dto/pagination.dto';
import { AffiliateLinkView, toAffiliateLinkView } from './affiliate-link.entity';
import { CreateAffiliateLinkDto } from './dto/create-affiliate-link.dto';
import { ListAffiliateLinksQueryDto } from './dto/list-affiliate-links.dto';
import { UpdateAffiliateLinkDto } from './dto/update-affiliate-link.dto';

@Injectable()
export class AffiliateLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAffiliateLinksQueryDto): Promise<Paginated<AffiliateLinkView>> {
    const { take, skip } = paginationArgs(query);

    const where: Prisma.AffiliateLinkWhereInput = {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.active === undefined ? {} : { active: query.active }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.affiliateLink.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: { product: true },
      }),
      this.prisma.affiliateLink.count({ where }),
    ]);

    return { data: rows.map(toAffiliateLinkView), total, take, skip };
  }

  async create(dto: CreateAffiliateLinkDto): Promise<AffiliateLinkView> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true },
    });

    if (!product) {
      throw new UnprocessableEntityException(`Produto ${dto.productId} nao encontrado`);
    }

    const link = await this.prisma.affiliateLink.create({
      data: {
        productId: dto.productId,
        url: dto.url,
        label: dto.label ?? null,
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
      include: { product: true },
    });

    return toAffiliateLinkView(link);
  }

  async update(id: string, dto: UpdateAffiliateLinkDto): Promise<AffiliateLinkView> {
    const exists = await this.prisma.affiliateLink.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Link de afiliado ${id} nao encontrado`);
    }

    const link = await this.prisma.affiliateLink.update({
      where: { id },
      data: {
        ...(dto.url === undefined ? {} : { url: dto.url }),
        ...(dto.label === undefined ? {} : { label: dto.label }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
      },
      include: { product: true },
    });

    return toAffiliateLinkView(link);
  }
}
