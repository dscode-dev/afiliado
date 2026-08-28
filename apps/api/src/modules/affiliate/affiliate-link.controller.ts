import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Paginated } from '../../common/dto/pagination.dto';
import { AffiliateLinkView } from './affiliate-link.entity';
import { AffiliateLinkService } from './affiliate-link.service';
import { CreateAffiliateLinkDto } from './dto/create-affiliate-link.dto';
import { ListAffiliateLinksQueryDto } from './dto/list-affiliate-links.dto';
import { UpdateAffiliateLinkDto } from './dto/update-affiliate-link.dto';

@Controller('affiliate-links')
export class AffiliateLinkController {
  constructor(private readonly links: AffiliateLinkService) {}

  @Get()
  list(@Query() query: ListAffiliateLinksQueryDto): Promise<Paginated<AffiliateLinkView>> {
    return this.links.list(query);
  }

  @Post()
  create(@Body() dto: CreateAffiliateLinkDto): Promise<AffiliateLinkView> {
    return this.links.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAffiliateLinkDto,
  ): Promise<AffiliateLinkView> {
    return this.links.update(id, dto);
  }
}
