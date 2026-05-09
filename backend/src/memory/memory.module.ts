import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SupabaseModule } from '../supabase/supabase.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';

import { MemoryAdapterRegistry } from './adapters/memory-adapter.registry';
import { DefaultMemoryAdapter } from './adapters/default-memory.adapter';
import { ObsidianMemoryAdapter } from './adapters/obsidian-memory.adapter';
import { MemoryConnectionsService } from './memory-connections.service';
import { MemoryRouterService } from './memory-router.service';
import { MemoryController } from './memory.controller';
import { MemoryCronService } from './memory-cron.service';

/**
 * MemoryModule (BE05)
 *
 * Provides the full pluggable memory layer:
 * - Registers DefaultMemoryAdapter + ObsidianMemoryAdapter at startup
 * - Exports MemoryRouterService for injection into ConversationsModule
 * - Exposes REST API via MemoryController
 * - Runs salience decay cron via MemoryCronService (BE08)
 */
@Module({
  imports: [SupabaseModule, AiAssistantModule],
  controllers: [MemoryController],
  providers: [
    MemoryAdapterRegistry,
    DefaultMemoryAdapter,
    ObsidianMemoryAdapter,
    MemoryConnectionsService,
    MemoryRouterService,
    MemoryCronService,
  ],
  exports: [
    MemoryRouterService,
    MemoryConnectionsService,
    MemoryAdapterRegistry,
  ],
})
export class MemoryModule implements OnModuleInit {
  private readonly logger = new Logger(MemoryModule.name);

  constructor(
    private readonly registry: MemoryAdapterRegistry,
    private readonly defaultAdapter: DefaultMemoryAdapter,
    private readonly obsidianAdapter: ObsidianMemoryAdapter,
  ) {}

  onModuleInit() {
    this.registry.register(this.defaultAdapter);
    this.registry.register(this.obsidianAdapter);
    this.logger.log(
      `MemoryModule initialized — adapters: [${this.registry.listSlugs().join(', ')}]`,
    );
  }
}
