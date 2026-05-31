import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { agentMemories } from '../db/schema';

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

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Every 6 hours: decay salience of episodic memories older than 1 day.
   * Floor at 0.1 to prevent complete fade-out.
   */
  @Cron('0 */6 * * *')
  async decaySalience(): Promise<void> {
    this.logger.debug('Running salience decay cron...');

    try {
      const cutoff = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();

      // Apply decay in a single statement: salience = MAX(0.1, salience * 0.98)
      // for episodic memories still valid (valid_to IS NULL) and older than 1 day.
      const updated = await this.db
        .update(agentMemories)
        .set({
          salience: sql`GREATEST(0.1, ${agentMemories.salience} * 0.98)`,
        })
        .where(
          and(
            eq(agentMemories.type, 'episodic'),
            isNull(agentMemories.validTo),
            lt(agentMemories.createdAt, cutoff),
          ),
        )
        .returning({ id: agentMemories.id });

      if (updated.length === 0) {
        this.logger.debug('decaySalience(): no episodic memories to decay');
        return;
      }

      this.logger.log(
        `decaySalience(): decayed salience for ${updated.length} episodic memories`,
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

    try {
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const deleted = await this.db
        .delete(agentMemories)
        .where(
          and(
            eq(agentMemories.type, 'episodic'),
            lt(agentMemories.salience, 0.15),
            lt(agentMemories.createdAt, thirtyDaysAgo),
          ),
        )
        .returning({ id: agentMemories.id });

      if (deleted.length === 0) {
        this.logger.debug('purgeOldMemories(): no memories to purge');
        return;
      }

      this.logger.log(
        `purgeOldMemories(): purged ${deleted.length} expired episodic memories`,
      );
    } catch (err: any) {
      this.logger.error(`purgeOldMemories() threw: ${err.message}`);
    }
  }
}
