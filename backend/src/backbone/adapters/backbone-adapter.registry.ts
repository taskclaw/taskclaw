import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { BackboneAdapter } from './backbone-adapter.interface';

/**
 * BackboneAdapterRegistry (F006)
 *
 * Holds all registered backbone adapters keyed by slug.
 * Adapters are registered at module init time.
 */
@Injectable()
export class BackboneAdapterRegistry {
  private readonly logger = new Logger(BackboneAdapterRegistry.name);
  private readonly adapters = new Map<string, BackboneAdapter>();

  /**
   * Register a backbone adapter.
   * Throws if a duplicate slug is detected (fail-fast during startup).
   */
  register(adapter: BackboneAdapter): void {
    if (this.adapters.has(adapter.slug)) {
      throw new Error(
        `BackboneAdapter with slug "${adapter.slug}" is already registered`,
      );
    }
    this.adapters.set(adapter.slug, adapter);
    this.logger.log(`Registered backbone adapter: ${adapter.slug}`);
  }

  /**
   * Retrieve an adapter by slug.
   * Throws BadRequestException when the slug is unknown so callers
   * get a clear error rather than a null-pointer later.
   */
  get(slug: string): BackboneAdapter {
    const adapter = this.adapters.get(slug);
    if (!adapter) {
      throw new BadRequestException(
        `Unknown backbone type "${slug}". Available: ${this.listSlugs().join(', ')}`,
      );
    }
    return adapter;
  }

  /** Check whether a slug is registered */
  has(slug: string): boolean {
    return this.adapters.has(slug);
  }

  /** List all registered slugs */
  listSlugs(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** Get all registered adapters */
  getAll(): BackboneAdapter[] {
    return Array.from(this.adapters.values());
  }
}
