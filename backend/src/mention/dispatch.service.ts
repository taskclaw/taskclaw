import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import {
  MentionContext,
  MentionExpandService,
  type ExpandedMention,
} from './expand.service';

interface DispatchInput {
  account_id: string;
  source_task_id: string;
  source_user_id: string | null;
  source_agent_id?: string | null;
  text: string;
  /** Used for loop protection — incremented each generation. */
  parent_mention_depth?: number;
}

interface DispatchResult {
  expanded_text: string;
  mentions: ExpandedMention[];
  spawned: Array<{
    task_id: string;
    agent_id: string;
    agent_name: string;
  }>;
}

/** Hard cap on mention chains, per PRD §15 open question 5 ("Loop protection"). */
const MAX_MENTION_DEPTH = 3;

/**
 * MentionDispatchService — owns the side effects of @-mentions in any
 * markdown surface that opts in (PRD §7).
 *
 * Today's surfaces:
 *   - tasks.notes saved through TasksService
 *   - tasks.title (rare, but the same regex applies)
 *
 * For each @agent mention in the text the dispatcher:
 *   1. Builds a MentionContext from the account's users + agents + recent tasks.
 *   2. Asks ExpandService to rewrite the text and emit structured mentions.
 *   3. For agent mentions, creates a new task assigned to the mentioned agent
 *      with creator_type='user', input_context.trigger='mention',
 *      and input_context.mention_depth = parent_depth + 1.
 *   4. Refuses to spawn when mention_depth > MAX_MENTION_DEPTH (loop guard).
 *
 * Returns the expanded text so callers can persist the rewritten markdown
 * back to the source row (so subsequent reads see the [@X](mention://...)
 * form, not the raw @X).
 */
@Injectable()
export class MentionDispatchService {
  private readonly logger = new Logger(MentionDispatchService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly expand: MentionExpandService,
  ) {}

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const { account_id, source_task_id, source_user_id, text } = input;
    if (!text || !text.includes('@')) {
      return { expanded_text: text, mentions: [], spawned: [] };
    }

    const depth = (input.parent_mention_depth ?? 0) + 1;

    const ctx = await this.loadContext(account_id);
    const result = this.expand.expand(text, ctx);

    const spawned: DispatchResult['spawned'] = [];
    if (depth > MAX_MENTION_DEPTH) {
      this.logger.warn(
        `Mention chain depth ${depth} exceeded MAX_MENTION_DEPTH=${MAX_MENTION_DEPTH}; skipping spawn for task ${source_task_id}.`,
      );
      return { expanded_text: result.expanded, mentions: result.mentions, spawned };
    }

    for (const mention of result.mentions) {
      if (mention.kind !== 'agent') continue;
      try {
        const task = await this.spawnTaskForAgent({
          account_id,
          agent_id: mention.id,
          agent_name: mention.display.replace(/^@/, ''),
          source_task_id,
          source_user_id,
          mention_depth: depth,
          mention_text: text,
        });
        if (task) spawned.push(task);
      } catch (err) {
        this.logger.error(
          `Mention spawn failed for agent ${mention.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { expanded_text: result.expanded, mentions: result.mentions, spawned };
  }

  // ------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------

  private async loadContext(accountId: string): Promise<MentionContext> {
    const client = this.supabaseAdmin.getClient();
    const users = new Map<string, string>();
    const agents = new Map<string, string>();
    const tasks = new Map<string, string>();

    const [userRows, agentRows] = await Promise.all([
      client
        .from('account_users')
        .select('user_id, users(id, full_name, email)')
        .eq('account_id', accountId),
      client
        .from('agents')
        .select('id, name, slug, is_active')
        .eq('account_id', accountId)
        .eq('is_active', true),
    ]);

    for (const row of userRows.data ?? []) {
      const u = (row as any).users;
      if (!u) continue;
      // Prefer full_name with spaces stripped, fall back to email local-part.
      if (u.full_name) {
        const handle = String(u.full_name).split(/\s+/).join('');
        if (handle) users.set(handle, u.id);
      }
      if (u.email) {
        const local = String(u.email).split('@')[0];
        if (local) users.set(local, u.id);
      }
    }

    for (const a of agentRows.data ?? []) {
      if (a.name) agents.set(String(a.name).split(/\s+/).join(''), a.id);
      if (a.slug) agents.set(String(a.slug), a.id);
    }

    // tasks map is left empty here for v1 — populating it requires either a
    // T-1234 short id column (not yet shipped) or a substring scan over
    // recent tasks. Future enhancement; the regex still works without it.

    return { users, agents, tasks };
  }

  private async spawnTaskForAgent(args: {
    account_id: string;
    agent_id: string;
    agent_name: string;
    source_task_id: string;
    source_user_id: string | null;
    mention_depth: number;
    mention_text: string;
  }) {
    const client = this.supabaseAdmin.getClient();

    // Idempotency: skip if a task with this exact (source_task_id, agent_id,
    // mention_depth) tuple already exists. Prevents duplicate spawns when a
    // notes field is saved twice with the same mention.
    const { data: existing } = await client
      .from('tasks')
      .select('id')
      .eq('account_id', args.account_id)
      .eq('assignee_type', 'agent')
      .eq('assignee_id', args.agent_id)
      .filter('input_context->>source_task_id', 'eq', args.source_task_id)
      .filter('input_context->>mention_depth', 'eq', String(args.mention_depth))
      .maybeSingle();
    if (existing) {
      return {
        task_id: existing.id,
        agent_id: args.agent_id,
        agent_name: args.agent_name,
      };
    }

    const { data, error } = await client
      .from('tasks')
      .insert({
        account_id: args.account_id,
        title: `Follow-up for @${args.agent_name}`,
        notes: this.excerpt(args.mention_text),
        status: 'To-Do',
        priority: 'Medium',
        assignee_type: 'agent',
        assignee_id: args.agent_id,
        creator_type: 'user',
        creator_id: args.source_user_id,
        input_context: {
          trigger: 'mention',
          source_task_id: args.source_task_id,
          source_user_id: args.source_user_id,
          mention_depth: args.mention_depth,
        },
      })
      .select('id')
      .single();
    if (error || !data) {
      this.logger.error(
        `tasks.insert failed for mention spawn: ${error?.message ?? 'unknown'}`,
      );
      return null;
    }
    this.logger.log(
      `Mention spawned task ${data.id} for agent ${args.agent_name} (depth=${args.mention_depth}, source=${args.source_task_id})`,
    );
    return {
      task_id: data.id,
      agent_id: args.agent_id,
      agent_name: args.agent_name,
    };
  }

  private excerpt(text: string): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    return trimmed.length > 500 ? trimmed.slice(0, 500) + '…' : trimmed;
  }
}
