import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

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

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  async getInbox(accountId: string, limit = 100): Promise<InboxSummary> {
    const client = this.supabaseAdmin.getClient();
    const items: InboxItem[] = [];

    // Pod name lookup once for all rows that have a pod_id.
    const { data: podRows } = await client
      .from('pods')
      .select('id, name, slug')
      .eq('account_id', accountId);
    const podName = new Map<string, { name: string; slug: string }>(
      (podRows ?? []).map((p: any) => [p.id, { name: p.name, slug: p.slug }]),
    );

    // 1. orchestrated_tasks pending_approval — highest priority.
    const { data: pendingOrch } = await client
      .from('orchestrated_tasks')
      .select('id, goal, pod_id, created_at, autonomy_level')
      .eq('account_id', accountId)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false })
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
    const { data: agentReqs } = await client
      .from('agent_approval_requests')
      .select(
        'id, reason, status, created_at, orchestrated_task_id, requested_by_agent_id, agents:agents(name, slug), orchestrated_tasks:orchestrated_tasks!inner(account_id, pod_id, goal)',
      )
      .eq('orchestrated_tasks.account_id', accountId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);
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
    const { data: dagApprovals } = await client
      .from('dag_approvals')
      .select(
        'id, dag_id, notes, created_at, task_dags:task_dags!inner(account_id, pod_id, goal_summary)',
      )
      .eq('task_dags.account_id', accountId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);
    for (const r of dagApprovals ?? []) {
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
    const { data: openMentions } = await client
      .from('tasks')
      .select(
        'id, title, board_instance_id, input_context, created_at, board_instances:board_instances(name)',
      )
      .eq('account_id', accountId)
      .eq('completed', false)
      .filter('input_context->>trigger', 'eq', 'mention')
      .order('created_at', { ascending: false })
      .limit(limit);
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
    const client = this.supabaseAdmin.getClient();

    const [{ count: orch }, { count: dag }] = await Promise.all([
      client
        .from('orchestrated_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .eq('status', 'pending_approval'),
      client
        .from('dag_approvals')
        .select('id, task_dags!inner(account_id)', { count: 'exact', head: true })
        .eq('task_dags.account_id', accountId)
        .eq('status', 'pending'),
    ]);

    if (orch === null && dag === null) {
      throw new BadRequestException('Failed to query approval counts');
    }
    return (orch ?? 0) + (dag ?? 0);
  }
}
