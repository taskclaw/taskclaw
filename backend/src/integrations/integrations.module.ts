import { Module, forwardRef } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { IntegrationsService } from './integrations.service';
import { ToolRegistryService } from './tool-registry.service';
import {
  IntegrationsController,
  BoardIntegrationRefsController,
} from './integrations.controller';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { AiProviderModule } from '../ai-provider/ai-provider.module';

@Module({
  imports: [ CommonModule, forwardRef(() => AiProviderModule)],
  controllers: [
    IntegrationsController,
    BoardIntegrationRefsController,
    OAuthController,
  ],
  providers: [IntegrationsService, OAuthService, ToolRegistryService],
  exports: [IntegrationsService, ToolRegistryService],
})
export class IntegrationsModule {}
