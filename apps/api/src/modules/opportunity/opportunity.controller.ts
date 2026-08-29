import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Paginated } from '../../common/dto/pagination.dto';
import { ListOpportunitiesQueryDto } from './dto/list-opportunities.dto';
import { OperatorDecisionDto } from './dto/operator-decision.dto';
import { OpportunityQueryService, OpportunityView } from './opportunity-query.service';
import { OpportunityService } from './opportunity.service';
import { EvaluationResult } from './opportunity.types';

@Controller('opportunities')
export class OpportunityController {
  constructor(
    private readonly opportunities: OpportunityQueryService,
    private readonly engine: OpportunityService,
  ) {}

  /** Estado operacional: score do engine e decisao humana, lado a lado. */
  @Get()
  list(@Query() query: ListOpportunitiesQueryDto): Promise<Paginated<OpportunityView>> {
    return this.opportunities.list(query);
  }

  /** Registra a decisao humana e reavalia para refletir na Offer. */
  @Post(':productId/decision')
  @HttpCode(HttpStatus.OK)
  decide(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: OperatorDecisionDto,
  ): Promise<EvaluationResult> {
    return this.engine.decide(productId, dto.decision, dto.note);
  }

  /** Remove o override humano e devolve a decisao ao engine. */
  @Delete(':productId/decision')
  @HttpCode(HttpStatus.OK)
  clearDecision(
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<EvaluationResult> {
    return this.engine.decide(productId, null, undefined);
  }
}
