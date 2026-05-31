import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { tokenUsage, tokenUsageDaily } from '../db/schema';

export interface RecordUsageInput {
  account_id: string;
  agent_id?: string | null;
  pod_id?: string | null;
  conversation_id?: string | null;
  task_id?: string | null;
  message_id?: string | null;
  provider: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  latency_ms?: number;
}

/**
 * Per-million-token pricing in USD. Numbers are intentionally kept simple
 * and conservative — they're a sticker estimate, not a contract. Real cost
 * comes from the provider invoice; the dashboard's job is to compare
 * relative spend across pods/agents/models, not to balance the books.
 *
 * Cache reads on Anthropic are 0.1× the input rate by spec; cache writes
 * (5-min) are 1.25×. We bake those ratios in below.
 */
const PRICE_PER_MILLION: Record<
  string,
  { input: number; output: number; cache_read: number; cache_write: number }
> = {
  'claude-opus-4-7': { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
  'claude-opus-4-6': { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
  'claude-haiku-4-5': { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
  'gpt-4o': { input: 2.5, output: 10, cache_read: 0.5, cache_write: 0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6, cache_read: 0.075, cache_write: 0 },
  'o1': { input: 15, output: 60, cache_read: 7.5, cache_write: 0 },
};
const FALLBACK_PRICE = { input: 5, output: 15, cache_read: 0.5, cache_write: 6.25 };

/**
 * TokenUsageService — records per-call usage rows and runs a daily rollup
 * into token_usage_daily (PRD §11). Writes are fire-and-forget from the
 * caller; failures here must never break a backbone send.
 */
@Injectable()
export class TokenUsageService {
  private readonly logger = new Logger(TokenUsageService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async record(input: RecordUsageInput): Promise<void> {
    const cost = this.estimateCost(input);
    try {
      await this.db.insert(tokenUsage).values({
        accountId: input.account_id,
        agentId: input.agent_id ?? null,
        podId: input.pod_id ?? null,
        conversationId: input.conversation_id ?? null,
        taskId: input.task_id ?? null,
        messageId: input.message_id ?? null,
        provider: input.provider,
        model: input.model,
        inputTokens: input.input_tokens ?? 0,
        outputTokens: input.output_tokens ?? 0,
        cacheReadTokens: input.cache_read_tokens ?? 0,
        cacheWriteTokens: input.cache_write_tokens ?? 0,
        estimatedCostUsd: String(cost),
        latencyMs: input.latency_ms ?? null,
      });
    } catch (error) {
      this.logger.warn(
        `token_usage insert failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  estimateCost(input: RecordUsageInput): number {
    const price = PRICE_PER_MILLION[input.model] ?? FALLBACK_PRICE;
    const inTok = input.input_tokens ?? 0;
    const outTok = input.output_tokens ?? 0;
    const cacheR = input.cache_read_tokens ?? 0;
    const cacheW = input.cache_write_tokens ?? 0;
    const cost =
      (inTok * price.input +
        outTok * price.output +
        cacheR * price.cache_read +
        cacheW * price.cache_write) /
      1_000_000;
    return Number(cost.toFixed(6));
  }

  // ============================================================
  // Daily rollup
  // ============================================================

  @Cron(CronExpression.EVERY_HOUR)
  async rollupTick() {
    try {
      await this.runRollup();
    } catch (err) {
      this.logger.error(
        `Daily rollup failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Aggregates yesterday's and today's raw token_usage rows into daily
   * buckets. Idempotent — uses the unique index on (account, day, pod,
   * agent, provider, model) to upsert.
   */
  async runRollup(): Promise<{ days: number; rows_inserted: number }> {
    // Pull last 48h of rows and group by day. We re-process today twice
    // an hour (idempotent) so the dashboard stays close to live.
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    let rows: (typeof tokenUsage.$inferSelect)[];
    try {
      rows = await this.db
        .select()
        .from(tokenUsage)
        .where(gte(tokenUsage.createdAt, since));
    } catch (error) {
      this.logger.warn(
        `rollup fetch failed: ${error instanceof Error ? error.message : error}`,
      );
      return { days: 0, rows_inserted: 0 };
    }

    const groups = new Map<string, any>();
    for (const r of rows ?? []) {
      const day = (r.createdAt as string).slice(0, 10);
      const key = [
        r.accountId,
        day,
        r.podId ?? '00000000-0000-0000-0000-000000000000',
        r.agentId ?? '00000000-0000-0000-0000-000000000000',
        r.provider,
        r.model,
      ].join('|');
      const cur = groups.get(key) ?? {
        account_id: r.accountId,
        day,
        pod_id: r.podId,
        agent_id: r.agentId,
        provider: r.provider,
        model: r.model,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_read_tokens: 0,
        total_cache_write_tokens: 0,
        total_cost_usd: 0,
        call_count: 0,
      };
      cur.total_input_tokens += r.inputTokens ?? 0;
      cur.total_output_tokens += r.outputTokens ?? 0;
      cur.total_cache_read_tokens += r.cacheReadTokens ?? 0;
      cur.total_cache_write_tokens += r.cacheWriteTokens ?? 0;
      cur.total_cost_usd =
        Number(cur.total_cost_usd) + Number(r.estimatedCostUsd ?? 0);
      cur.call_count += 1;
      groups.set(key, cur);
    }

    const upserts = [...groups.values()].map((g) => ({
      ...g,
      total_cost_usd: Number(Number(g.total_cost_usd).toFixed(6)),
      rolled_up_at: new Date().toISOString(),
    }));

    if (upserts.length === 0) return { days: 0, rows_inserted: 0 };

    // Replace each (account, day, pod?, agent?, provider, model) row.
    // Supabase doesn't expose composite-key upsert via PostgREST, so we
    // delete-then-insert per group. Cheap because the group set is small.
    for (const g of upserts) {
      await this.db
        .delete(tokenUsageDaily)
        .where(
          and(
            eq(tokenUsageDaily.accountId, g.account_id),
            eq(tokenUsageDaily.day, g.day),
            eq(tokenUsageDaily.provider, g.provider),
            eq(tokenUsageDaily.model, g.model),
            g.pod_id == null
              ? isNull(tokenUsageDaily.podId)
              : eq(tokenUsageDaily.podId, g.pod_id),
            g.agent_id == null
              ? isNull(tokenUsageDaily.agentId)
              : eq(tokenUsageDaily.agentId, g.agent_id),
          ),
        );
    }
    try {
      await this.db.insert(tokenUsageDaily).values(
        upserts.map((g) => ({
          accountId: g.account_id,
          day: g.day,
          podId: g.pod_id ?? null,
          agentId: g.agent_id ?? null,
          provider: g.provider,
          model: g.model,
          totalInputTokens: g.total_input_tokens,
          totalOutputTokens: g.total_output_tokens,
          totalCacheReadTokens: g.total_cache_read_tokens,
          totalCacheWriteTokens: g.total_cache_write_tokens,
          totalCostUsd: String(g.total_cost_usd),
          callCount: g.call_count,
          rolledUpAt: g.rolled_up_at,
        })),
      );
    } catch (insertErr) {
      this.logger.warn(
        `rollup insert failed: ${insertErr instanceof Error ? insertErr.message : insertErr}`,
      );
      return { days: 0, rows_inserted: 0 };
    }
    return { days: upserts.length, rows_inserted: upserts.length };
  }

  // ============================================================
  // Read APIs for dashboard
  // ============================================================

  async getDashboardSummary(accountId: string, daysBack = 30) {
    const cutoff = new Date(Date.now() - daysBack * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const daily = await this.db
      .select()
      .from(tokenUsageDaily)
      .where(
        and(
          eq(tokenUsageDaily.accountId, accountId),
          gte(tokenUsageDaily.day, cutoff),
        ),
      )
      .orderBy(asc(tokenUsageDaily.day));

    const totalCost = (daily ?? []).reduce(
      (s, r: any) => s + Number(r.totalCostUsd ?? 0),
      0,
    );
    const totalInput = (daily ?? []).reduce(
      (s, r: any) => s + Number(r.totalInputTokens ?? 0),
      0,
    );
    const totalCacheRead = (daily ?? []).reduce(
      (s, r: any) => s + Number(r.totalCacheReadTokens ?? 0),
      0,
    );
    const cacheHitRate =
      totalInput + totalCacheRead === 0
        ? 0
        : totalCacheRead / (totalInput + totalCacheRead);

    // Cost by pod (last N days)
    const byPod = new Map<string, number>();
    for (const r of daily ?? []) {
      const k = r.podId ?? 'unassigned';
      byPod.set(k, (byPod.get(k) ?? 0) + Number(r.totalCostUsd ?? 0));
    }

    // Cost by day for the line chart
    const byDay = new Map<string, number>();
    for (const r of daily ?? []) {
      byDay.set(r.day as string, (byDay.get(r.day as string) ?? 0) + Number(r.totalCostUsd ?? 0));
    }

    return {
      window_days: daysBack,
      total_cost_usd: Number(totalCost.toFixed(4)),
      total_calls: (daily ?? []).reduce((s: number, r: any) => s + (r.callCount ?? 0), 0),
      cache_hit_rate: Number(cacheHitRate.toFixed(4)),
      cost_by_pod: [...byPod.entries()].map(([pod_id, cost]) => ({
        pod_id,
        cost_usd: Number(cost.toFixed(4)),
      })),
      cost_by_day: [...byDay.entries()].map(([day, cost]) => ({
        day,
        cost_usd: Number(cost.toFixed(4)),
      })),
    };
  }
}
