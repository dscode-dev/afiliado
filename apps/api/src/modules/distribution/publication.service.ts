import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Paginated, paginationArgs } from '../../common/dto/pagination.dto';
import { ListPublicationsQueryDto } from './dto/list-publications.dto';
import { PublicationView, toPublicationView } from './publication.entity';

/**
 * Publicacoes ainda nao sao criadas pela aplicacao: a escrita chega no PR de
 * distribuicao, junto com os workers. Aqui existe apenas leitura administrativa.
 */
@Injectable()
export class PublicationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPublicationsQueryDto): Promise<Paginated<PublicationView>> {
    const { take, skip } = paginationArgs(query);

    const where: Prisma.PublicationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.channelId ? { channelId: query.channelId } : {}),
      ...(query.offerId ? { offerId: query.offerId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.publication.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: { channel: true, offer: true },
      }),
      this.prisma.publication.count({ where }),
    ]);

    return { data: rows.map(toPublicationView), total, take, skip };
  }
}
