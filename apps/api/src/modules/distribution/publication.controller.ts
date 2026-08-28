import { Controller, Get, Query } from '@nestjs/common';
import { Paginated } from '../../common/dto/pagination.dto';
import { ListPublicationsQueryDto } from './dto/list-publications.dto';
import { PublicationView } from './publication.entity';
import { PublicationService } from './publication.service';

@Controller('publications')
export class PublicationController {
  constructor(private readonly publications: PublicationService) {}

  @Get()
  list(@Query() query: ListPublicationsQueryDto): Promise<Paginated<PublicationView>> {
    return this.publications.list(query);
  }
}
