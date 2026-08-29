import { Module } from '@nestjs/common';
import { AffiliateLinkController } from './affiliate-link.controller';
import { AffiliateLinkService } from './affiliate-link.service';
import { AffiliateBotClient } from './generation/affiliate-bot.client';
import { AffiliateGenerationController } from './generation/generation.controller';
import { AffiliateLinkGeneratorService } from './generation/affiliate-link-generator.service';

/**
 * Links de afiliado: cadastro manual e geracao automatica.
 *
 * A geracao vive em `generation/` e fala com o affiliate-bot, um processo
 * separado. Se o bot cair, apenas links novos deixam de surgir.
 */
@Module({
  controllers: [AffiliateLinkController, AffiliateGenerationController],
  providers: [
    AffiliateLinkService,
    // Factory explicita: o client le process.env, nao dependencias injetadas.
    { provide: AffiliateBotClient, useFactory: () => new AffiliateBotClient() },
    AffiliateLinkGeneratorService,
  ],
  exports: [AffiliateLinkGeneratorService, AffiliateBotClient],
})
export class AffiliateModule {}
