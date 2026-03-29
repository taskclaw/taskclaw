import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import { AdapterRegistry } from './adapter.registry';
import { ADAPTER_METADATA } from './adapter.decorator';
import { NotionAdapter } from './notion/notion.adapter';
import { ClickUpAdapter } from './clickup/clickup.adapter';

/**
 * AdaptersModule
 *
 * Auto-discovers all classes decorated with @Adapter('providerName')
 * and registers them in the AdapterRegistry at startup.
 *
 * To add a new integration, simply:
 *   1. Create a new adapter class implementing SourceAdapter
 *   2. Decorate it with @Adapter('yourProvider') and @Injectable()
 *   3. Add it to the `providers` and `exports` arrays below
 *
 * The adapter will be auto-registered — no manual registration needed.
 */
@Module({
  imports: [DiscoveryModule],
  providers: [AdapterRegistry, NotionAdapter, ClickUpAdapter],
  exports: [AdapterRegistry, NotionAdapter, ClickUpAdapter],
})
export class AdaptersModule implements OnModuleInit {
  private readonly logger = new Logger(AdaptersModule.name);

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    private readonly registry: AdapterRegistry,
  ) {}

  onModuleInit() {
    // Scan all providers for the @Adapter() decorator
    const providers = this.discovery.getProviders();

    for (const wrapper of providers) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;

      const providerName = this.reflector.get<string>(
        ADAPTER_METADATA,
        metatype,
      );

      if (providerName) {
        this.registry.register(providerName, instance);
        this.logger.log(`Auto-registered adapter: ${providerName}`);
      }
    }

    this.logger.log(
      `Adapter registry ready — providers: [${this.registry.getRegisteredProviders().join(', ')}]`,
    );
  }
}
