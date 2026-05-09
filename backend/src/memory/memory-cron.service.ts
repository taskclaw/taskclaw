import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

/**
 * MemoryCronService (BE08)
 *
 * Scheduled jobs for memory salience management:
 * - decaySalience(): every 6h — episodic memories age gracefully (salience *= 0.98, floor 0.1)
 * - purgeOldMemories(): daily at 3am — delete expired low-salience episodic memories
 */
@Injectable()
export class MemoryCronService {
  private readonly logger = new Logger(MemoryCronService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  /**
   * Every 6 hours: decay salience of episodic memories older than 1 day.
   * Floor at 0.1 to prevent complete fade-out.
   */
  @Cron('0 */6 * * *')
  async decaySalience(): Promise<void> {
    this.logger.debug('Running salience decay cron...');
    const client = this.supabaseAdmin.getClient();

    try {
      // Use raw SQL via RPC or raw query — Supabase JS doesn't support UPDATE...RETURNING count easily
      // We use a workaround: fetch IDs then update in batch
      const { data: rows, error: fetchError } = await client
        .from('agent_memories')
        .select('id, salience')
        .eq('type', 'episodic')
        .is('valid_to', null)
        .lt(
          'created_at',
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        );

      if (fetchError) {
        this.logger.error(
          `decaySalience() fetch failed: ${fetchError.message}`,
        );
        return;
      }

      if (!rows || rows.length === 0) {
        this.logger.debug('decaySalience(): no episodic memories to decay');
        return;
      }

      // Apply decay: salience = MAX(0.1, salience * 0.98)
      const updates = rows.map((row) => ({
        id: row.id,
        salience: Math.max(0.1, (row.salience ?? 1.0) * 0.98),
      }));

      // Batch upsert
      const { error: updateError } = await client
        .from('agent_memories')
        .upsert(updates, { onConflict: 'id' });

      if (updateError) {
        this.logger.error(
          `decaySalience() update failed: ${updateError.message}`,
        );
        return;
      }

      this.logger.log(
        `decaySalience(): decayed salience for ${rows.length} episodic memories`,
      );
    } catch (err: any) {
      this.logger.error(`decaySalience() threw: ${err.message}`);
    }
  }

  /**
   * Daily at 3am: purge episodic memories with very low salience that are > 30 days old.
   * Threshold: salience < 0.15 AND created_at < NOW() - 30 days
   */
  @Cron('0 3 * * *')
  async purgeOldMemories(): Promise<void> {
    this.logger.debug('Running memory purge cron...');
    const client = this.supabaseAdmin.getClient();

    try {
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: toDelete, error: fetchError } = await client
        .from('agent_memories')
        .select('id')
        .eq('type', 'episodic')
        .lt('salience', 0.15)
        .lt('created_at', thirtyDaysAgo);

      if (fetchError) {
        this.logger.error(
          `purgeOldMemories() fetch failed: ${fetchError.message}`,
        );
        return;
      }

      if (!toDelete || toDelete.length === 0) {
        this.logger.debug('purgeOldMemories(): no memories to purge');
        return;
      }

      const ids = toDelete.map((r) => r.id);
      const { error: deleteError } = await client
        .from('agent_memories')
        .delete()
        .in('id', ids);

      if (deleteError) {
        this.logger.error(
          `purgeOldMemories() delete failed: ${deleteError.message}`,
        );
        return;
      }

      this.logger.log(
        `purgeOldMemories(): purged ${ids.length} expired episodic memories`,
      );
    } catch (err: any) {
      this.logger.error(`purgeOldMemories() threw: ${err.message}`);
    }
  }
}
