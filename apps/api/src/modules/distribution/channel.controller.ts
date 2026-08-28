import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Paginated } from '../../common/dto/pagination.dto';
import { ChannelView } from './channel.entity';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { ListChannelsQueryDto } from './dto/list-channels.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Controller('channels')
export class ChannelController {
  constructor(private readonly channels: ChannelService) {}

  @Get()
  list(@Query() query: ListChannelsQueryDto): Promise<Paginated<ChannelView>> {
    return this.channels.list(query);
  }

  @Post()
  create(@Body() dto: CreateChannelDto): Promise<ChannelView> {
    return this.channels.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChannelDto,
  ): Promise<ChannelView> {
    return this.channels.update(id, dto);
  }
}
