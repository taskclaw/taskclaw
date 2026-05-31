import { Injectable, Inject, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { accountUsers, agents, tasks } from '../db/schema';
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
    @Inject(DB) private readonly db: Db,
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
    const users = new Map<string, string>();
    const agentMap = new Map<string, string>();
    const tasksMap = new Map<string, string>();

    // Drizzle's relational query returns the joined account_users row under the
    // relation name (`user`); PostgREST returned it under the table name
    // (`users`). Re-key to `users` so the downstream shape is unchanged.
    const [userRows, agentRows] = await Promise.all([
      this.db.query.accountUsers.findMany({
        where: eq(accountUsers.accountId, accountId),
        columns: { userId: true },
        with: {
          user: { columns: { id: true, name: true, email: true } },
        },
      }),
      this.db
        .select({
          id: agents.id,
          name: agents.name,
          slug: agents.slug,
          is_active: agents.isActive,
        })
        .from(agents)
        .where(and(eq(agents.accountId, accountId), eq(agents.isActive, true))),
    ]);

    for (const row of userRows) {
      const u = (row as any).user;
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

    for (const a of agentRows) {
      if (a.name) agentMap.set(String(a.name).split(/\s+/).join(''), a.id);
      if (a.slug) agentMap.set(String(a.slug), a.id);
    }

    // tasks map is left empty here for v1 — populating it requires either a
    // T-1234 short id column (not yet shipped) or a substring scan over
    // recent tasks. Future enhancement; the regex still works without it.

    return { users, agents: agentMap, tasks: tasksMap };
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
    // Idempotency: skip if a task with this exact (source_task_id, agent_id,
    // mention_depth) tuple already exists. Prevents duplicate spawns when a
    // notes field is saved twice with the same mention.
    const [existing] = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.accountId, args.account_id),
          eq(tasks.assigneeType, 'agent'),
          eq(tasks.assigneeId, args.agent_id),
          sql`${tasks.inputContext}->>'source_task_id' = ${args.source_task_id}`,
          sql`${tasks.inputContext}->>'mention_depth' = ${String(args.mention_depth)}`,
        ),
      )
      .limit(1);
    if (existing) {
      return {
        task_id: existing.id,
        agent_id: args.agent_id,
        agent_name: args.agent_name,
      };
    }

    const rows = await this.db
      .insert(tasks)
      .values({
        accountId: args.account_id,
        title: `Follow-up for @${args.agent_name}`,
        notes: this.excerpt(args.mention_text),
        status: 'To-Do',
        priority: 'Medium',
        assigneeType: 'agent',
        assigneeId: args.agent_id,
        creatorType: 'user',
        creatorId: args.source_user_id,
        inputContext: {
          trigger: 'mention',
          source_task_id: args.source_task_id,
          source_user_id: args.source_user_id,
          mention_depth: args.mention_depth,
        },
      })
      .returning({ id: tasks.id });
    const data = rows[0];
    if (!data) {
      this.logger.error(
        `tasks.insert failed for mention spawn: ${'unknown'}`,
      );
      return null;
    }
    // Note: Drizzle throws on DB error (caught by the caller's try/catch in
    // dispatch()), so the `!data` guard above only fires on an empty returning.
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
