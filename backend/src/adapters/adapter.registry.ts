import { Injectable, NotFoundException } from '@nestjs/common';
import { SourceAdapter } from './interfaces/source-adapter.interface';

/**
 * AdapterRegistry
 *
 * Central registry for all source adapters. Provides a factory pattern
 * to get the appropriate adapter based on the provider name.
 */
@Injectable()
export class AdapterRegistry {
  private adapters: Map<string, SourceAdapter> = new Map();

  /**
   * Register an adapter for a specific provider
   */
  register(provider: string, adapter: SourceAdapter) {
    this.adapters.set(provider, adapter);
  }

  /**
   * Get an adapter for a specific provider
   * @throws NotFoundException if adapter is not registered
   */
  getAdapter(provider: string): SourceAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new NotFoundException(
        `No adapter registered for provider: ${provider}`,
      );
    }
    return adapter;
  }

  /**
   * Check if an adapter is registered for a provider
   */
  hasAdapter(provider: string): boolean {
    return this.adapters.has(provider);
  }

  /**
   * Get all registered provider names
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.adapters.keys());
  }
}
