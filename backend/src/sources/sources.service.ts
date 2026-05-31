import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { sources, categories } from '../db/schema';
import { AccessControlHelper } from '../common/helpers/access-control.helper';
import { AdapterRegistry } from '../adapters/adapter.registry';
import { CreateSourceDto } from './dto/create-source.dto';
import { UpdateSourceDto } from './dto/update-source.dto';

@Injectable()
export class SourcesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly accessControl: AccessControlHelper,
    private readonly adapterRegistry: AdapterRegistry,
  ) {}

  /**
   * Drizzle's relational query returns the joined row under the relation name
   * (`category`); PostgREST returned it under the table name (`categories`).
   * Re-key to `categories` so the response shape callers depend on is unchanged,
   * and mask sensitive config in the same pass.
   */
  private present(row: any) {
    const { category, ...rest } = row;
    return {
      ...rest,
      categories: category ?? null,
      config: this.maskSensitiveConfig(rest.config),
    };
  }

  async findAll(userId: string, accountId: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const rows = await this.db.query.sources.findMany({
      where: eq(sources.accountId, accountId),
      orderBy: desc(sources.createdAt),
      with: { category: true },
    });

    return rows.map((r) => this.present(r));
  }

  async findOne(userId: string, accountId: string, id: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const row = await this.db.query.sources.findFirst({
      where: and(eq(sources.id, id), eq(sources.accountId, accountId)),
      with: { category: true },
    });

    if (!row) {
      throw new NotFoundException(`Source with ID ${id} not found`);
    }
    return this.present(row);
  }

  /**
   * Find a source without masking sensitive config values.
   * Used internally when we need the actual API keys (e.g. to fetch properties).
   */
  async findOneUnmasked(userId: string, accountId: string, id: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const [row] = await this.db
      .select()
      .from(sources)
      .where(and(eq(sources.id, id), eq(sources.accountId, accountId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Source with ID ${id} not found`);
    }
    return row;
  }

  async create(
    userId: string,
    accountId: string,
    createSourceDto: CreateSourceDto,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify category exists and belongs to this account
    const [category] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, createSourceDto.category_id),
          eq(categories.accountId, accountId),
        ),
      )
      .limit(1);

    if (!category) {
      throw new BadRequestException('Invalid agent ID for this account');
    }

    // Validate config using the appropriate adapter
    const adapter = this.adapterRegistry.getAdapter(createSourceDto.provider);
    const validation = await adapter.validateConfig(createSourceDto.config);

    if (!validation.valid) {
      throw new BadRequestException(
        `Invalid ${createSourceDto.provider} configuration: ${validation.error}`,
      );
    }

    const [row] = await this.db
      .insert(sources)
      .values({
        accountId,
        categoryId: createSourceDto.category_id,
        provider: createSourceDto.provider,
        config: createSourceDto.config,
        syncIntervalMinutes: createSourceDto.sync_interval_minutes ?? 30,
        isActive: createSourceDto.is_active !== false, // Default to true
        syncStatus: 'idle',
        connectionId: createSourceDto.connection_id ?? null,
      })
      .returning();

    return {
      ...row,
      config: this.maskSensitiveConfig(row.config),
    };
  }

  async update(
    userId: string,
    accountId: string,
    id: string,
    updateSourceDto: UpdateSourceDto,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify source exists and belongs to account
    const existing = await this.findOne(userId, accountId, id);

    // If updating category, verify it belongs to this account
    if (updateSourceDto.category_id) {
      const [category] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, updateSourceDto.category_id),
            eq(categories.accountId, accountId),
          ),
        )
        .limit(1);

      if (!category) {
        throw new BadRequestException('Invalid agent ID for this account');
      }
    }

    // If updating config, validate it
    if (updateSourceDto.config) {
      const adapter = this.adapterRegistry.getAdapter(existing.provider);
      const validation = await adapter.validateConfig(updateSourceDto.config);

      if (!validation.valid) {
        throw new BadRequestException(
          `Invalid configuration: ${validation.error}`,
        );
      }
    }

    // Map the snake_case DTO to camelCase columns (only defined fields).
    const patch: Partial<typeof sources.$inferInsert> = {};
    if (updateSourceDto.category_id !== undefined)
      patch.categoryId = updateSourceDto.category_id;
    if (updateSourceDto.config !== undefined)
      patch.config = updateSourceDto.config;
    if (updateSourceDto.sync_interval_minutes !== undefined)
      patch.syncIntervalMinutes = updateSourceDto.sync_interval_minutes;
    if (updateSourceDto.is_active !== undefined)
      patch.isActive = updateSourceDto.is_active;
    if (updateSourceDto.sync_filters !== undefined)
      patch.syncFilters = updateSourceDto.sync_filters;
    if (updateSourceDto.category_property !== undefined)
      patch.categoryProperty = updateSourceDto.category_property;

    const [row] = await this.db
      .update(sources)
      .set(patch)
      .where(and(eq(sources.id, id), eq(sources.accountId, accountId)))
      .returning();

    return {
      ...row,
      config: this.maskSensitiveConfig(row.config),
    };
  }

  async remove(userId: string, accountId: string, id: string) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    // Verify source exists and belongs to account
    await this.findOne(userId, accountId, id);

    await this.db
      .delete(sources)
      .where(and(eq(sources.id, id), eq(sources.accountId, accountId)));

    return { message: 'Source deleted successfully' };
  }

  /**
   * Validate a source configuration without creating it
   */
  async validateSource(
    userId: string,
    accountId: string,
    provider: string,
    config: Record<string, any>,
  ) {
    await this.accessControl.verifyAccountAccess(null, accountId, userId);

    const adapter = this.adapterRegistry.getAdapter(provider);
    return adapter.validateConfig(config);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private maskSensitiveConfig(config: unknown): Record<string, any> {
    const masked: Record<string, any> = { ...(config as Record<string, any>) };

    // Mask API keys, tokens, passwords
    const sensitiveKeys = [
      'api_key',
      'token',
      'password',
      'secret',
      'api_token',
    ];

    for (const key of Object.keys(masked)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        const value = String(masked[key] || '');
        masked[key] =
          value.length > 8
            ? `${value.slice(0, 4)}****${value.slice(-4)}`
            : '****';
      }
    }

    return masked;
  }
}
