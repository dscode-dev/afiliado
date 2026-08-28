import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Paginated } from '../../common/dto/pagination.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { ListOffersQueryDto } from './dto/list-offers.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OfferView } from './offer.entity';
import { OfferService } from './offer.service';

@Controller('offers')
export class OfferController {
  constructor(private readonly offers: OfferService) {}

  @Get()
  list(@Query() query: ListOffersQueryDto): Promise<Paginated<OfferView>> {
    return this.offers.list(query);
  }

  @Post()
  create(@Body() dto: CreateOfferDto): Promise<OfferView> {
    return this.offers.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOfferDto): Promise<OfferView> {
    return this.offers.update(id, dto);
  }
}
