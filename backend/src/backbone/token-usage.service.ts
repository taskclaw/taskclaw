import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

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

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async record(input: RecordUsageInput): Promise<void> {
    const cost = this.estimateCost(input);
    const client = this.supabaseAdmin.getClient();
    const { error } = await client.from('token_usage').insert({
      account_id: input.account_id,
      agent_id: input.agent_id ?? null,
      pod_id: input.pod_id ?? null,
      conversation_id: input.conversation_id ?? null,
      task_id: input.task_id ?? null,
      message_id: input.message_id ?? null,
      provider: input.provider,
      model: input.model,
      input_tokens: input.input_tokens ?? 0,
      output_tokens: input.output_tokens ?? 0,
      cache_read_tokens: input.cache_read_tokens ?? 0,
      cache_write_tokens: input.cache_write_tokens ?? 0,
      estimated_cost_usd: cost,
      latency_ms: input.latency_ms ?? null,
    });
    if (error) {
      this.logger.warn(`token_usage insert failed: ${error.message}`);
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
    const client = this.supabaseAdmin.getClient();
    // Pull last 48h of rows and group by day. We re-process today twice
    // an hour (idempotent) so the dashboard stays close to live.
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await client
      .from('token_usage')
      .select('*')
      .gte('created_at', since);
    if (error) {
      this.logger.warn(`rollup fetch failed: ${error.message}`);
      return { days: 0, rows_inserted: 0 };
    }

    const groups = new Map<string, any>();
    for (const r of rows ?? []) {
      const day = (r.created_at as string).slice(0, 10);
      const key = [
        r.account_id,
        day,
        r.pod_id ?? '00000000-0000-0000-0000-000000000000',
        r.agent_id ?? '00000000-0000-0000-0000-000000000000',
        r.provider,
        r.model,
      ].join('|');
      const cur = groups.get(key) ?? {
        account_id: r.account_id,
        day,
        pod_id: r.pod_id,
        agent_id: r.agent_id,
        provider: r.provider,
        model: r.model,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_read_tokens: 0,
        total_cache_write_tokens: 0,
        total_cost_usd: 0,
        call_count: 0,
      };
      cur.total_input_tokens += r.input_tokens ?? 0;
      cur.total_output_tokens += r.output_tokens ?? 0;
      cur.total_cache_read_tokens += r.cache_read_tokens ?? 0;
      cur.total_cache_write_tokens += r.cache_write_tokens ?? 0;
      cur.total_cost_usd =
        Number(cur.total_cost_usd) + Number(r.estimated_cost_usd ?? 0);
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
      await client
        .from('token_usage_daily')
        .delete()
        .eq('account_id', g.account_id)
        .eq('day', g.day)
        .eq('provider', g.provider)
        .eq('model', g.model)
        .eq('pod_id', g.pod_id ?? null)
        .eq('agent_id', g.agent_id ?? null);
    }
    const { error: insertErr } = await client
      .from('token_usage_daily')
      .insert(upserts);
    if (insertErr) {
      this.logger.warn(`rollup insert failed: ${insertErr.message}`);
      return { days: 0, rows_inserted: 0 };
    }
    return { days: upserts.length, rows_inserted: upserts.length };
  }

  // ============================================================
  // Read APIs for dashboard
  // ============================================================

  async getDashboardSummary(accountId: string, daysBack = 30) {
    const client = this.supabaseAdmin.getClient();
    const cutoff = new Date(Date.now() - daysBack * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const { data: daily } = await client
      .from('token_usage_daily')
      .select('*')
      .eq('account_id', accountId)
      .gte('day', cutoff)
      .order('day', { ascending: true });

    const totalCost = (daily ?? []).reduce(
      (s, r: any) => s + Number(r.total_cost_usd ?? 0),
      0,
    );
    const totalInput = (daily ?? []).reduce(
      (s, r: any) => s + Number(r.total_input_tokens ?? 0),
      0,
    );
    const totalCacheRead = (daily ?? []).reduce(
      (s, r: any) => s + Number(r.total_cache_read_tokens ?? 0),
      0,
    );
    const cacheHitRate =
      totalInput + totalCacheRead === 0
        ? 0
        : totalCacheRead / (totalInput + totalCacheRead);

    // Cost by pod (last N days)
    const byPod = new Map<string, number>();
    for (const r of daily ?? []) {
      const k = r.pod_id ?? 'unassigned';
      byPod.set(k, (byPod.get(k) ?? 0) + Number(r.total_cost_usd ?? 0));
    }

    // Cost by day for the line chart
    const byDay = new Map<string, number>();
    for (const r of daily ?? []) {
      byDay.set(r.day as string, (byDay.get(r.day as string) ?? 0) + Number(r.total_cost_usd ?? 0));
    }

    return {
      window_days: daysBack,
      total_cost_usd: Number(totalCost.toFixed(4)),
      total_calls: (daily ?? []).reduce((s: number, r: any) => s + (r.call_count ?? 0), 0),
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
