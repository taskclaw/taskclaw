import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { backboneConnections } from '../db/schema';
import { BackboneAdapterRegistry } from './adapters/backbone-adapter.registry';
import { BackboneConnectionsService } from './backbone-connections.service';

/**
 * BackboneHealthService (F012)
 *
 * Periodically pings every active backbone connection and updates its
 * health_status column.
 */
@Injectable()
export class BackboneHealthService {
  private readonly logger = new Logger(BackboneHealthService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly registry: BackboneAdapterRegistry,
    private readonly connections: BackboneConnectionsService,
  ) {}

  /**
   * Run health checks for all active backbone connections every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAll() {
    let rows: (typeof backboneConnections.$inferSelect)[];
    try {
      rows = await this.db
        .select()
        .from(backboneConnections)
        .where(eq(backboneConnections.isActive, true));
    } catch (error) {
      this.logger.error(`Failed to load connections for health check: ${error.message}`);
      return;
    }

    if (!rows || rows.length === 0) return;

    this.logger.debug(`Running health checks for ${rows.length} backbone connections`);

    const results = await Promise.allSettled(
      rows.map((row) =>
        // checkOne reads snake_case fields (the controller passes a raw
        // PostgREST row); re-key the Drizzle row so its shape is unchanged.
        this.checkOne({
          ...row,
          backbone_type: row.backboneType,
          config: row.config,
          id: row.id,
        }),
      ),
    );

    const healthy = results.filter(
      (r) => r.status === 'fulfilled' && r.value === 'healthy',
    ).length;

    this.logger.debug(
      `Health check complete: ${healthy}/${rows.length} healthy`,
    );
  }

  /**
   * Check a single connection and persist the result.
   * Exposed publicly so the controller can trigger a verify.
   */
  async checkOne(
    connection: any,
  ): Promise<'healthy' | 'degraded' | 'down'> {
    try {
      if (!this.registry.has(connection.backbone_type)) {
        await this.connections.updateHealth(
          connection.id,
          'down',
          `Unknown backbone type: ${connection.backbone_type}`,
        );
        return 'down';
      }

      const adapter = this.registry.get(connection.backbone_type);
      const config = this.connections.decryptConfig(connection.config);

      const result = await adapter.healthCheck(config);

      const status = result.healthy
        ? result.latencyMs && result.latencyMs > 5000
          ? 'degraded'
          : 'healthy'
        : 'down';

      await this.connections.updateHealth(
        connection.id,
        status,
        result.error,
      );

      return status;
    } catch (err) {
      this.logger.error(
        `Health check failed for connection ${connection.id}: ${err.message}`,
      );
      await this.connections.updateHealth(
        connection.id,
        'down',
        err.message,
      );
      return 'down';
    }
  }
}
