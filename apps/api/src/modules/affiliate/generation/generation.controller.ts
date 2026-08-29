import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AffiliateBotClient, BotStatusResponse } from './affiliate-bot.client';
import {
  AffiliateLinkGeneratorService,
  BatchGenerationReport,
  GenerationResult,
} from './affiliate-link-generator.service';

@Controller('affiliate-links')
export class AffiliateGenerationController {
  constructor(
    private readonly generator: AffiliateLinkGeneratorService,
    private readonly bot: AffiliateBotClient,
  ) {}

  /** Situacao da sessao do bot e tag ativa. */
  @Get('generation/status')
  status(): Promise<BotStatusResponse> {
    return this.bot.status();
  }

  /** Gera para todos os produtos ativos sem link. */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generateMissing(): Promise<BatchGenerationReport> {
    return this.generator.generateMissing();
  }

  /** Garante link para um produto especifico. */
  @Post('generate/:productId')
  @HttpCode(HttpStatus.OK)
  generateForProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<GenerationResult> {
    return this.generator.ensureForProduct(productId);
  }
}
