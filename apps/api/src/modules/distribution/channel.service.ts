import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Paginated, paginationArgs } from '../../common/dto/pagination.dto';
import { ChannelView, toChannelView } from './channel.entity';
import { CreateChannelDto } from './dto/create-channel.dto';
import { ListChannelsQueryDto } from './dto/list-channels.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListChannelsQueryDto): Promise<Paginated<ChannelView>> {
    const { take, skip } = paginationArgs(query);

    const where: Prisma.ChannelWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.active === undefined ? {} : { active: query.active }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.channel.findMany({ where, take, skip, orderBy: { createdAt: 'desc' } }),
      this.prisma.channel.count({ where }),
    ]);

    return { data: rows.map(toChannelView), total, take, skip };
  }

  async create(dto: CreateChannelDto): Promise<ChannelView> {
    const channel = await this.prisma.channel.create({
      data: {
        type: dto.type,
        name: dto.name,
        externalIdentifier: dto.externalIdentifier ?? null,
        ...(dto.active === undefined ? {} : { active: dto.active }),
        ...(dto.configuration === undefined
          ? {}
          : { configuration: dto.configuration as Prisma.InputJsonValue }),
      },
    });

    return toChannelView(channel);
  }

  async update(id: string, dto: UpdateChannelDto): Promise<ChannelView> {
    const exists = await this.prisma.channel.findUnique({ where: { id }, select: { id: true } });

    if (!exists) {
      throw new NotFoundException(`Canal ${id} nao encontrado`);
    }

    const channel = await this.prisma.channel.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.externalIdentifier === undefined
          ? {}
          : { externalIdentifier: dto.externalIdentifier }),
        ...(dto.active === undefined ? {} : { active: dto.active }),
        ...(dto.configuration === undefined
          ? {}
          : { configuration: dto.configuration as Prisma.InputJsonValue }),
      },
    });

    return toChannelView(channel);
  }
}
