import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MemoryAdapter } from './memory-adapter.interface';

/**
 * MemoryAdapterRegistry (BE01)
 *
 * Holds all registered memory adapters keyed by slug.
 * Adapters are registered at module init time in MemoryModule.onModuleInit().
 * Mirrors BackboneAdapterRegistry pattern exactly.
 */
@Injectable()
export class MemoryAdapterRegistry {
  private readonly logger = new Logger(MemoryAdapterRegistry.name);
  private readonly adapters = new Map<string, MemoryAdapter>();

  /**
   * Register a memory adapter.
   * Throws if a duplicate slug is detected (fail-fast during startup).
   */
  register(adapter: MemoryAdapter): void {
    if (this.adapters.has(adapter.slug)) {
      throw new Error(
        `MemoryAdapter with slug "${adapter.slug}" is already registered`,
      );
    }
    this.adapters.set(adapter.slug, adapter);
    this.logger.log(`Registered memory adapter: ${adapter.slug}`);
  }

  /**
   * Retrieve an adapter by slug.
   * Throws BadRequestException when the slug is unknown.
   */
  resolve(slug: string): MemoryAdapter {
    const adapter = this.adapters.get(slug);
    if (!adapter) {
      throw new BadRequestException(
        `Unknown memory adapter "${slug}". Available: ${this.listSlugs().join(', ')}`,
      );
    }
    return adapter;
  }

  /** Check whether a slug is registered */
  has(slug: string): boolean {
    return this.adapters.has(slug);
  }

  /** List all registered adapters */
  list(): MemoryAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** List all registered slugs */
  listSlugs(): string[] {
    return Array.from(this.adapters.keys());
  }
}
