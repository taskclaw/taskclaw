import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SyncsService } from './syncs.service';
import type { SyncRow } from './dto/syncs.schema';

/**
 * Periodic scan of enabled syncs. Picks the syncs whose schedule_cron has
 * elapsed since last_run_at and dispatches them through SyncsService. The
 * loop is per-process; SyncsService maintains a soft lock to skip overlap.
 *
 * v1: minute-resolution cron parsing supported only for the most common
 * Vixie-style 5-field expressions. For finer cadences or DST-sensitive
 * schedules we will graduate to BullMQ repeatable jobs (PRD §4.5) and a
 * proper cron parser, without changing the SyncRunner contract.
 */
@Injectable()
export class SyncsScheduler {
  private readonly logger = new Logger(SyncsScheduler.name);

  constructor(private readonly syncs: SyncsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    let due: SyncRow[];
    try {
      due = await this.syncs.findEnabledSyncs();
    } catch (err) {
      this.logger.error(
        `findEnabledSyncs failed: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }

    const now = Date.now();
    for (const sync of due) {
      if (!sync.schedule_cron) continue; // manual-only
      if (!this.isDue(sync, now)) continue;
      try {
        await this.syncs.executeSync(sync, 'schedule');
      } catch (err) {
        // Errors are already recorded against sync_runs by SyncsService.
        this.logger.warn(
          `Sync ${sync.id} run failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  /**
   * Decide whether a scheduled sync is due. Conservative: if we cannot
   * understand the cron expression, fall back to a daily cadence so a
   * user-misconfigured cron doesn't loop every minute.
   */
  private isDue(sync: SyncRow, nowMs: number): boolean {
    const last = sync.last_run_at ? new Date(sync.last_run_at).getTime() : 0;
    if (!sync.schedule_cron) return false;

    const intervalMs = this.cronToIntervalMs(sync.schedule_cron);
    if (intervalMs === null) return nowMs - last >= 24 * 60 * 60 * 1000;
    return nowMs - last >= intervalMs;
  }

  /**
   * Best-effort interval inference from common cron forms.
   *   "0 * * * *"      hourly
   *   "*\/5 * * * *"   every 5 minutes
   *   "0 0 * * *"      daily
   *   "0 0 * * 0"      weekly
   *   "0 2 * * *"      daily-at-02
   * Returns null if we cannot infer.
   */
  private cronToIntervalMs(expr: string): number | null {
    const trimmed = expr.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 5) return null;
    const [min, hour, dom, mon, dow] = parts;

    // Every-N-minutes: */N * * * *
    const stepMin = min.match(/^\*\/(\d+)$/);
    if (stepMin && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      const n = Number(stepMin[1]);
      if (Number.isFinite(n) && n > 0) return n * 60 * 1000;
    }

    // Hourly: <number> * * * *
    if (/^\d+$/.test(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return 60 * 60 * 1000;
    }

    // Weekly: <m> <h> * * <dow>
    if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && /^\d+$/.test(dow)) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    // Daily: <m> <h> * * *
    if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
      return 24 * 60 * 60 * 1000;
    }

    return null;
  }
}
