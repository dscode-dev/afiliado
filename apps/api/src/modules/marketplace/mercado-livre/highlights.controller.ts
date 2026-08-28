import { Controller, Get, Query } from '@nestjs/common';
import { HighlightsQueryDto } from './dto/highlights-query.dto';
import { HighlightsResult, HighlightsService } from './highlights.service';

/**
 * Descoberta de produtos com demanda comprovada.
 * Somente leitura: importar e uma acao explicita do operador em /products/import.
 */
@Controller('marketplace/mercado-livre')
export class HighlightsController {
  constructor(private readonly highlights: HighlightsService) {}

  @Get('highlights')
  byCategory(@Query() query: HighlightsQueryDto): Promise<HighlightsResult> {
    return this.highlights.byCategory(query.categoryId);
  }
}
