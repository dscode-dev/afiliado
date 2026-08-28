import { Controller, Get } from '@nestjs/common';
import { DashboardSummary, SummaryService } from './summary.service';

/**
 * Contadores do dashboard administrativo. Existe porque o painel precisa deles
 * agora - qualquer analytics alem disso e escopo de PR futuro.
 */
@Controller('analytics')
export class SummaryController {
  constructor(private readonly summary: SummaryService) {}

  @Get('summary')
  dashboard(): Promise<DashboardSummary> {
    return this.summary.dashboard();
  }
}
