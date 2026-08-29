import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PublishOfferDto } from '../dto/publish-offer.dto';
import { ManualChannelQueryDto } from '../dto/manual-channel.dto';
import {
  ManualDistributionService,
  ManualPreview,
  ManualPublicationResult,
} from './manual-distribution.service';

/**
 * Distribuicao semiassistida, para canais sem API oficial de publicacao.
 *
 * O sistema prepara o conteudo e registra o resultado; a publicacao em si e
 * feita pelo operador dentro do proprio aplicativo.
 */
@Controller('offers')
export class ManualDistributionController {
  constructor(private readonly manual: ManualDistributionService) {}

  /** Preview pronto para copiar. Somente leitura: nao cria Publication. */
  @Get(':id/manual-preview')
  preview(
    @Param('id', ParseUUIDPipe) offerId: string,
    @Query() query: ManualChannelQueryDto,
  ): Promise<ManualPreview> {
    return this.manual.preview(offerId, query.channelId);
  }

  /** Registra que o operador publicou manualmente no canal. */
  @Post(':id/manual-publication')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('id', ParseUUIDPipe) offerId: string,
    @Body() dto: PublishOfferDto,
  ): Promise<ManualPublicationResult> {
    return this.manual.confirmPublication(offerId, dto.channelId);
  }
}
