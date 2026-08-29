import { Module } from '@nestjs/common';
import { HighlightsController } from './mercado-livre/highlights.controller';
import { HighlightsService } from './mercado-livre/highlights.service';
import { MercadoLivreClient } from './mercado-livre/mercado-livre.client';
import { MercadoLivreConfig } from './mercado-livre/mercado-livre.config';
import { MercadoLivreTokenService } from './mercado-livre/mercado-livre-token.service';
import { MercadoLivreCredentialStore } from './mercado-livre/credential.store';
import { MercadoLivreOAuthController } from './mercado-livre/oauth.controller';

/**
 * Fronteira com marketplaces externos. Hoje existe apenas Mercado Livre - nao
 * ha abstracao multi-marketplace porque nao ha segundo marketplace.
 */
@Module({
  controllers: [HighlightsController, MercadoLivreOAuthController],
  providers: [
    // Factory explicita: a config le process.env, nao dependencias injetadas.
    { provide: MercadoLivreConfig, useFactory: () => new MercadoLivreConfig() },
    MercadoLivreCredentialStore,
    MercadoLivreTokenService,
    MercadoLivreClient,
    HighlightsService,
  ],
  exports: [MercadoLivreClient, MercadoLivreConfig, MercadoLivreTokenService],
})
export class MarketplaceModule {}
