import { Module } from '@nestjs/common';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DistributionModule } from '../distribution/distribution.module';
import { OpportunityModule } from '../opportunity/opportunity.module';
import { AutomationConfig } from './automation.config';
import { AutomationController } from './automation.controller';
import { AutomationOrchestrator } from './automation.orchestrator';
import { AutomationScheduler } from './automation.scheduler';
import { AutomationState } from './automation.state';
import { Clock } from './clock';
import { DistributionPolicyService } from './distribution-policy.service';

/**
 * Autopilot: executa o pipeline ja existente em intervalos controlados.
 * Nao introduz integracao externa nova - apenas orquestra o que ja havia.
 */
@Module({
  imports: [AffiliateModule, CatalogModule, OpportunityModule, DistributionModule],
  controllers: [AutomationController],
  providers: [
    // Factory explicita: a config le process.env, nao dependencias injetadas.
    { provide: AutomationConfig, useFactory: () => new AutomationConfig() },
    Clock,
    AutomationState,
    DistributionPolicyService,
    AutomationOrchestrator,
    AutomationScheduler,
  ],
  exports: [AutomationOrchestrator],
})
export class AutomationModule {}
