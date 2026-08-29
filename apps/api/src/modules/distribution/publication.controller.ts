import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Paginated } from '../../common/dto/pagination.dto';
import { ListPublicationsQueryDto } from './dto/list-publications.dto';
import { PublicationView } from './publication.entity';
import { PublicationService } from './publication.service';
import {
  PublishResult,
  PublicationDispatcher,
} from './publish/publication-dispatcher.service';

@Controller('publications')
export class PublicationController {
  constructor(
    private readonly publications: PublicationService,
    private readonly publisher: PublicationDispatcher,
  ) {}

  @Get()
  list(@Query() query: ListPublicationsQueryDto): Promise<Paginated<PublicationView>> {
    return this.publications.list(query);
  }

  /** Reenvia uma publicacao FAILED, reaproveitando o mesmo registro. */
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  retry(@Param('id', ParseUUIDPipe) id: string): Promise<PublishResult> {
    return this.publisher.retry(id);
  }
}
