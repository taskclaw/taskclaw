import { Module, forwardRef, OnModuleInit, Logger } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CommonModule } from '../common/common.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { BackboneAdapterRegistry } from './adapters/backbone-adapter.registry';
import { BackboneDefinitionsService } from './backbone-definitions.service';
import { BackboneConnectionsService } from './backbone-connections.service';
import { BackboneRouterService } from './backbone-router.service';
import { BackboneHealthService } from './backbone-health.service';
import { MigrateAiProvidersService } from './migrations/migrate-ai-providers';
import { BackboneConnectionsController } from './backbone-connections.controller';
import { ClaudeCodeAdapter } from './adapters/claude-code.adapter';
import { CodexAdapter } from './adapters/codex.adapter';
import { CustomHttpAdapter } from './adapters/custom-http.adapter';
import { OpenClawAdapter } from './adapters/openclaw.adapter';
import { OpenRouterAdapter } from './adapters/openrouter.adapter';
import { NemoClawAdapter } from './adapters/nemoclaw.adapter';

@Module({
  imports: [
    SupabaseModule,
    CommonModule,
    forwardRef(() => ConversationsModule),
  ],
  controllers: [BackboneConnectionsController],
  providers: [
    BackboneAdapterRegistry,
    BackboneDefinitionsService,
    BackboneConnectionsService,
    BackboneRouterService,
    BackboneHealthService,
    MigrateAiProvidersService,
    ClaudeCodeAdapter,
    CodexAdapter,
    CustomHttpAdapter,
    NemoClawAdapter,
  ],
  exports: [
    BackboneRouterService,
    BackboneConnectionsService,
    BackboneDefinitionsService,
    BackboneAdapterRegistry,
    MigrateAiProvidersService,
  ],
})
export class BackboneModule implements OnModuleInit {
  private readonly logger = new Logger(BackboneModule.name);

  constructor(
    private readonly registry: BackboneAdapterRegistry,
    private readonly claudeCodeAdapter: ClaudeCodeAdapter,
    private readonly codexAdapter: CodexAdapter,
    private readonly customHttpAdapter: CustomHttpAdapter,
    private readonly nemoClawAdapter: NemoClawAdapter,
  ) {}

  onModuleInit() {
    // ── Register backbone adapters (F007, F008 + F025-F027) ──
    this.registry.register(new OpenClawAdapter());
    this.registry.register(new OpenRouterAdapter());
    this.registry.register(this.claudeCodeAdapter);
    this.registry.register(this.codexAdapter);
    this.registry.register(this.customHttpAdapter);
    this.registry.register(this.nemoClawAdapter);

    this.logger.log(
      `BackboneModule initialised with adapters: [${this.registry.listSlugs().join(', ')}]`,
    );
  }
}
