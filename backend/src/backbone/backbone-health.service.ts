import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
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
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly registry: BackboneAdapterRegistry,
    private readonly connections: BackboneConnectionsService,
  ) {}

  /**
   * Run health checks for all active backbone connections every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAll() {
    const client = this.supabaseAdmin.getClient();

    const { data: rows, error } = await client
      .from('backbone_connections')
      .select('*')
      .eq('is_active', true);

    if (error) {
      this.logger.error(`Failed to load connections for health check: ${error.message}`);
      return;
    }

    if (!rows || rows.length === 0) return;

    this.logger.debug(`Running health checks for ${rows.length} backbone connections`);

    const results = await Promise.allSettled(
      rows.map((row) => this.checkOne(row)),
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
