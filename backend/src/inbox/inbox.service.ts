import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  pods,
  orchestratedTasks,
  agentApprovalRequests,
  agents,
  dagApprovals,
  taskDags,
  tasks,
  boardInstances,
} from '../db/schema';

export type InboxKind =
  | 'orchestration_pending_approval'
  | 'agent_approval_request'
  | 'dag_approval_pending'
  | 'mention_task_open';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  /** Headline for the row. */
  title: string;
  /** Sub-line, optional. */
  subtitle?: string;
  /** Where to navigate when the user clicks the row. */
  href?: string;
  /** Pod context for grouping. */
  pod_id?: string | null;
  pod_name?: string | null;
  /** ISO timestamp the row first needed attention. */
  created_at: string;
  /** 1 (highest) … 5 (lowest). Drives ordering. */
  priority: 1 | 2 | 3 | 4 | 5;
  /** Lookups the UI may need to act inline (approve / reject / open). */
  refs: Record<string, string | null | undefined>;
}

export interface InboxSummary {
  total: number;
  by_kind: Record<InboxKind, number>;
  items: InboxItem[];
}

/**
 * Inbox — the single "what needs me?" surface.
 *
 * Aggregates the existing approval-pending states scattered across the
 * orchestration tables into one ordered list. Read-only here; the UI
 * routes the user to the existing detail surfaces (cockpit card, board
 * task panel) where they can already act.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async getInbox(accountId: string, limit = 100): Promise<InboxSummary> {
    const items: InboxItem[] = [];

    // Pod name lookup once for all rows that have a pod_id.
    const podRows = await this.db
      .select({ id: pods.id, name: pods.name, slug: pods.slug })
      .from(pods)
      .where(eq(pods.accountId, accountId));
    const podName = new Map<string, { name: string; slug: string }>(
      (podRows ?? []).map((p: any) => [p.id, { name: p.name, slug: p.slug }]),
    );

    // 1. orchestrated_tasks pending_approval — highest priority.
    const pendingOrch = await this.db
      .select({
        id: orchestratedTasks.id,
        goal: orchestratedTasks.goal,
        pod_id: orchestratedTasks.podId,
        created_at: orchestratedTasks.createdAt,
        autonomy_level: orchestratedTasks.autonomyLevel,
      })
      .from(orchestratedTasks)
      .where(
        and(
          eq(orchestratedTasks.accountId, accountId),
          eq(orchestratedTasks.status, 'pending_approval'),
        ),
      )
      .orderBy(desc(orchestratedTasks.createdAt))
      .limit(limit);
    for (const r of pendingOrch ?? []) {
      const pod = r.pod_id ? podName.get(r.pod_id as string) : null;
      items.push({
        id: `orch:${r.id}`,
        kind: 'orchestration_pending_approval',
        title: r.goal,
        subtitle: pod ? `Pod: ${pod.name}` : 'Workspace task',
        href: pod
          ? `/dashboard/pods/${pod.slug}`
          : `/dashboard/cockpit?orchestration=${r.id}`,
        pod_id: r.pod_id ?? null,
        pod_name: pod?.name ?? null,
        created_at: r.created_at as string,
        priority: 1,
        refs: { orchestrated_task_id: r.id, pod_slug: pod?.slug ?? null },
      });
    }

    // 2. agent_approval_requests pending — usually in-flight pauses.
    // PostgREST embedded `agents:agents(name, slug)` and
    // `orchestrated_tasks:orchestrated_tasks!inner(account_id, pod_id, goal)`
    // with the account filter on the inner-joined task. Drizzle's relational
    // `with` can't filter the parent by a related column, so this is an
    // explicit inner join; the joined rows are re-keyed to `agents` /
    // `orchestrated_tasks` to preserve the response shape.
    const agentReqRows = await this.db
      .select({
        id: agentApprovalRequests.id,
        reason: agentApprovalRequests.reason,
        status: agentApprovalRequests.status,
        created_at: agentApprovalRequests.createdAt,
        orchestrated_task_id: agentApprovalRequests.orchestratedTaskId,
        requested_by_agent_id: agentApprovalRequests.requestedByAgentId,
        agent_name: agents.name,
        agent_slug: agents.slug,
        ot_account_id: orchestratedTasks.accountId,
        ot_pod_id: orchestratedTasks.podId,
        ot_goal: orchestratedTasks.goal,
      })
      .from(agentApprovalRequests)
      .innerJoin(
        orchestratedTasks,
        eq(agentApprovalRequests.orchestratedTaskId, orchestratedTasks.id),
      )
      .leftJoin(agents, eq(agentApprovalRequests.requestedByAgentId, agents.id))
      .where(
        and(
          eq(orchestratedTasks.accountId, accountId),
          eq(agentApprovalRequests.status, 'pending'),
        ),
      )
      .orderBy(desc(agentApprovalRequests.createdAt))
      .limit(limit);
    const agentReqs = (agentReqRows ?? []).map((r: any) => ({
      id: r.id,
      reason: r.reason,
      status: r.status,
      created_at: r.created_at,
      orchestrated_task_id: r.orchestrated_task_id,
      requested_by_agent_id: r.requested_by_agent_id,
      agents: r.agent_name != null || r.agent_slug != null
        ? { name: r.agent_name, slug: r.agent_slug }
        : null,
      orchestrated_tasks: {
        account_id: r.ot_account_id,
        pod_id: r.ot_pod_id,
        goal: r.ot_goal,
      },
    }));
    for (const r of agentReqs ?? []) {
      const ot: any = r.orchestrated_tasks;
      const agent: any = r.agents;
      const pod = ot?.pod_id ? podName.get(ot.pod_id) : null;
      items.push({
        id: `agentreq:${r.id}`,
        kind: 'agent_approval_request',
        title: agent?.name ? `${agent.name} requests approval` : 'Agent requests approval',
        subtitle: r.reason ?? ot?.goal ?? '',
        href: pod
          ? `/dashboard/pods/${pod.slug}`
          : `/dashboard/cockpit`,
        pod_id: ot?.pod_id ?? null,
        pod_name: pod?.name ?? null,
        created_at: r.created_at as string,
        priority: 2,
        refs: {
          approval_id: r.id,
          orchestrated_task_id: r.orchestrated_task_id,
          agent_slug: agent?.slug ?? null,
        },
      });
    }

    // 3. dag_approvals pending — DAG plans waiting for sign-off.
    // PostgREST embedded `task_dags:task_dags!inner(account_id, pod_id, goal_summary)`
    // with the account filter on the inner-joined dag. Explicit inner join;
    // the joined row is re-keyed to `task_dags` to preserve the response shape.
    const dagApprovalRows = await this.db
      .select({
        id: dagApprovals.id,
        dag_id: dagApprovals.dagId,
        notes: dagApprovals.notes,
        created_at: dagApprovals.createdAt,
        td_account_id: taskDags.accountId,
        td_pod_id: taskDags.podId,
      })
      .from(dagApprovals)
      .innerJoin(taskDags, eq(dagApprovals.dagId, taskDags.id))
      .where(
        and(
          eq(taskDags.accountId, accountId),
          eq(dagApprovals.status, 'pending'),
        ),
      )
      .orderBy(desc(dagApprovals.createdAt))
      .limit(limit);
    const dagApprovalsList = (dagApprovalRows ?? []).map((r: any) => ({
      id: r.id,
      dag_id: r.dag_id,
      notes: r.notes,
      created_at: r.created_at,
      task_dags: {
        account_id: r.td_account_id,
        pod_id: r.td_pod_id,
      },
    }));
    for (const r of dagApprovalsList ?? []) {
      const dag: any = r.task_dags;
      const pod = dag?.pod_id ? podName.get(dag.pod_id) : null;
      items.push({
        id: `dag:${r.id}`,
        kind: 'dag_approval_pending',
        title: dag?.goal_summary ?? 'Plan needs approval',
        subtitle: r.notes ?? (pod ? `Pod: ${pod.name}` : 'Workspace plan'),
        href: pod ? `/dashboard/pods/${pod.slug}` : '/dashboard/cockpit',
        pod_id: dag?.pod_id ?? null,
        pod_name: pod?.name ?? null,
        created_at: r.created_at as string,
        priority: 2,
        refs: { dag_approval_id: r.id, dag_id: r.dag_id },
      });
    }

    // 4. mention-spawned tasks still open — someone @-mentioned an agent and
    //    nothing has happened yet. Lower priority than direct approvals.
    // PostgREST embedded `board_instances:board_instances(name)`; Drizzle's
    // relation name is `boardInstance` → re-key to `board_instances`.
    const openMentionRows = await this.db.query.tasks.findMany({
      columns: {
        id: true,
        title: true,
        boardInstanceId: true,
        inputContext: true,
        createdAt: true,
      },
      where: and(
        eq(tasks.accountId, accountId),
        eq(tasks.completed, false),
        sql`${tasks.inputContext}->>'trigger' = 'mention'`,
      ),
      orderBy: desc(tasks.createdAt),
      limit,
      with: { boardInstance: { columns: { name: true } } },
    });
    const openMentions = (openMentionRows ?? []).map((r: any) => {
      const { boardInstance, boardInstanceId, inputContext, createdAt, ...rest } =
        r;
      return {
        ...rest,
        board_instance_id: boardInstanceId,
        input_context: inputContext,
        created_at: createdAt,
        board_instances: boardInstance ?? null,
      };
    });
    for (const r of openMentions ?? []) {
      const board: any = r.board_instances;
      items.push({
        id: `task:${r.id}`,
        kind: 'mention_task_open',
        title: r.title,
        subtitle: board?.name ? `Board: ${board.name}` : 'Mention-spawned task',
        href: r.board_instance_id
          ? `/dashboard/boards/${r.board_instance_id}?task=${r.id}`
          : `/dashboard/cockpit?task=${r.id}`,
        pod_id: null,
        pod_name: null,
        created_at: r.created_at as string,
        priority: 4,
        refs: { task_id: r.id, board_id: r.board_instance_id ?? null },
      });
    }

    // Sort: priority asc, then created_at desc.
    items.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.created_at.localeCompare(a.created_at);
    });

    const trimmed = items.slice(0, limit);
    const by_kind = {
      orchestration_pending_approval: 0,
      agent_approval_request: 0,
      dag_approval_pending: 0,
      mention_task_open: 0,
    } as Record<InboxKind, number>;
    for (const it of items) by_kind[it.kind] += 1;

    return { total: items.length, by_kind, items: trimmed };
  }

  /**
   * Quick count for the sidebar badge. Cheap — just counts the highest-
   * priority queues.
   */
  async getCount(accountId: string): Promise<number> {
    const [orchRows, dagRows] = await Promise.all([
      this.db
        .select({ value: count() })
        .from(orchestratedTasks)
        .where(
          and(
            eq(orchestratedTasks.accountId, accountId),
            eq(orchestratedTasks.status, 'pending_approval'),
          ),
        ),
      this.db
        .select({ value: count() })
        .from(dagApprovals)
        .innerJoin(taskDags, eq(dagApprovals.dagId, taskDags.id))
        .where(
          and(
            eq(taskDags.accountId, accountId),
            eq(dagApprovals.status, 'pending'),
          ),
        ),
    ]);

    const orch = orchRows[0]?.value ?? null;
    const dag = dagRows[0]?.value ?? null;

    if (orch === null && dag === null) {
      throw new BadRequestException('Failed to query approval counts');
    }
    return (orch ?? 0) + (dag ?? 0);
  }
}

