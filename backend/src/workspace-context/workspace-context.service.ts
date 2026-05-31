import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  pods,
  boardInstances,
  tasks,
  boardSteps,
  agents,
  agentSkills,
} from '../db/schema';

// ─── Shared type exported for backbone adapter prompt caching (F011) ───────
export interface CacheableBlock {
  text: string;
  cacheable: boolean;
}

// ─── Snapshot interfaces ────────────────────────────────────────────────────

export interface AgentSummary {
  id: string;
  name: string;
  status: string;
  skills: string[];
}

export interface BoardSummary {
  id: string;
  name: string;
  description: string | null;
  active_task_count: number;
}

export interface PodSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  autonomy_level: number;
  boards: BoardSummary[];
  agents: AgentSummary[];
}

export interface WorkspaceContextSnapshot {
  account_id: string;
  assembled_at: Date;
  pods: PodSummary[];
  total_pods: number;
  total_boards: number;
  total_agents: number;
}

// ─── Cache entry ────────────────────────────────────────────────────────────

interface CacheEntry {
  hash: string;
  block: CacheableBlock;
}

@Injectable()
export class WorkspaceContextService {
  private readonly logger = new Logger(WorkspaceContextService.name);

  /** In-memory cache: account_id → { hash, block } */
  private readonly contextCache = new Map<string, CacheEntry>();

  constructor(@Inject(DB) private readonly db: Db) {}

  // ─────────────────────────────────────────────────────────────────────────
  // F007 — Snapshot assembly
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Assemble a full WorkspaceContextSnapshot for an account.
   * Executes efficient queries: pods, boards-per-pod, active task counts,
   * agents-per-pod (via pilot_agent + board_steps default_agent), and skill names.
   * Target: <200 ms.
   */
  async getWorkspaceSnapshot(
    accountId: string,
  ): Promise<WorkspaceContextSnapshot> {
    const start = Date.now();

    // ── 1. Fetch all pods ──────────────────────────────────────────────────
    const podRows = await this.db
      .select({
        id: pods.id,
        slug: pods.slug,
        name: pods.name,
        description: pods.description,
        autonomy_level: pods.autonomyLevel,
        pilot_agent_id: pods.pilotAgentId,
      })
      .from(pods)
      .where(eq(pods.accountId, accountId))
      .orderBy(asc(pods.position));

    if (!podRows || podRows.length === 0) {
      const snapshot: WorkspaceContextSnapshot = {
        account_id: accountId,
        assembled_at: new Date(),
        pods: [],
        total_pods: 0,
        total_boards: 0,
        total_agents: 0,
      };
      this.logger.debug(
        `Snapshot assembled in ${Date.now() - start}ms (0 pods)`,
      );
      return snapshot;
    }

    const podIds = podRows.map((p) => p.id);

    // ── 2. Fetch all boards for these pods + active task counts ────────────
    const boardRows = await this.db
      .select({
        id: boardInstances.id,
        name: boardInstances.name,
        description: boardInstances.description,
        pod_id: boardInstances.podId,
      })
      .from(boardInstances)
      .where(
        and(
          inArray(boardInstances.podId, podIds),
          eq(boardInstances.accountId, accountId),
        ),
      );

    const boardIds = boardRows.map((b) => b.id);

    // ── 3. Active task counts per board ────────────────────────────────────
    const taskCounts: Record<string, number> = {};
    if (boardIds.length > 0) {
      const taskData = await this.db
        .select({ board_instance_id: tasks.boardInstanceId })
        .from(tasks)
        .where(
          and(
            inArray(tasks.boardInstanceId, boardIds),
            eq(tasks.accountId, accountId),
            inArray(tasks.status, ['pending', 'in_progress', 'active']),
          ),
        );

      for (const t of taskData) {
        if (t.board_instance_id) {
          taskCounts[t.board_instance_id] =
            (taskCounts[t.board_instance_id] || 0) + 1;
        }
      }
    }

    // ── 4. Agents: pilot agents + board_steps default agents per pod ───────
    // Collect all relevant agent IDs
    const agentIdSet = new Set<string>();
    const pilotAgentIdByPod: Record<string, string | null> = {};

    for (const pod of podRows) {
      pilotAgentIdByPod[pod.id] = pod.pilot_agent_id ?? null;
      if (pod.pilot_agent_id) {
        agentIdSet.add(pod.pilot_agent_id);
      }
    }

    // Also collect default_agent_ids from board_steps for boards in these pods
    const stepAgentsByBoard: Record<string, Set<string>> = {};
    if (boardIds.length > 0) {
      const steps = await this.db
        .select({
          board_instance_id: boardSteps.boardInstanceId,
          default_agent_id: boardSteps.defaultAgentId,
        })
        .from(boardSteps)
        .where(
          and(
            inArray(boardSteps.boardInstanceId, boardIds),
            isNotNull(boardSteps.defaultAgentId),
          ),
        );

      for (const step of steps) {
        if (step.default_agent_id) {
          agentIdSet.add(step.default_agent_id);
          if (!stepAgentsByBoard[step.board_instance_id]) {
            stepAgentsByBoard[step.board_instance_id] = new Set();
          }
          stepAgentsByBoard[step.board_instance_id].add(step.default_agent_id);
        }
      }
    }

    // ── 5. Fetch agent rows ────────────────────────────────────────────────
    const agentIds = Array.from(agentIdSet);
    const agentMap: Record<
      string,
      { id: string; name: string; status: string }
    > = {};

    if (agentIds.length > 0) {
      const agentRows = await this.db
        .select({
          id: agents.id,
          name: agents.name,
          status: agents.status,
        })
        .from(agents)
        .where(
          and(
            inArray(agents.id, agentIds),
            eq(agents.accountId, accountId),
            eq(agents.isActive, true),
          ),
        );

      for (const a of agentRows) {
        agentMap[a.id] = a;
      }
    }

    // ── 6. Fetch skill names per agent ────────────────────────────────────
    const skillsByAgent: Record<string, string[]> = {};
    if (agentIds.length > 0) {
      const agentSkillRows = await this.db.query.agentSkills.findMany({
        where: and(
          inArray(agentSkills.agentId, agentIds),
          eq(agentSkills.isActive, true),
        ),
        with: { skill: { columns: { name: true } } },
      });

      for (const as of agentSkillRows) {
        if (!skillsByAgent[as.agentId]) {
          skillsByAgent[as.agentId] = [];
        }
        const skillName = (as.skill as any)?.name;
        if (skillName) {
          skillsByAgent[as.agentId].push(skillName);
        }
      }
    }

    // ── 7. Assemble snapshot ───────────────────────────────────────────────
    // Board map by pod_id
    const boardsByPod: Record<string, BoardSummary[]> = {};
    for (const board of boardRows) {
      if (!board.pod_id) continue;
      if (!boardsByPod[board.pod_id]) {
        boardsByPod[board.pod_id] = [];
      }
      boardsByPod[board.pod_id].push({
        id: board.id,
        name: board.name,
        description: board.description ?? null,
        active_task_count: taskCounts[board.id] || 0,
      });
    }

    // Agent ID set per pod (pilot + step agents for boards in this pod)
    const agentsByPod: Record<string, Set<string>> = {};
    for (const pod of podRows) {
      agentsByPod[pod.id] = new Set<string>();
      if (pilotAgentIdByPod[pod.id]) {
        agentsByPod[pod.id].add(pilotAgentIdByPod[pod.id]!);
      }
      // Add agents from board steps belonging to this pod
      const podBoards = boardsByPod[pod.id] ?? [];
      for (const board of podBoards) {
        const boardAgents = stepAgentsByBoard[board.id];
        if (boardAgents) {
          for (const aid of boardAgents) {
            agentsByPod[pod.id].add(aid);
          }
        }
      }
    }

    const podSummaries: PodSummary[] = podRows.map((pod) => {
      const podAgentIds = Array.from(agentsByPod[pod.id] ?? []);
      const agents: AgentSummary[] = podAgentIds
        .filter((aid) => agentMap[aid])
        .map((aid) => ({
          id: aid,
          name: agentMap[aid].name,
          status: agentMap[aid].status,
          skills: skillsByAgent[aid] ?? [],
        }));

      return {
        id: pod.id,
        slug: pod.slug ?? '',
        name: pod.name,
        description: pod.description ?? null,
        autonomy_level: pod.autonomy_level ?? 1,
        boards: boardsByPod[pod.id] ?? [],
        agents,
      };
    });

    const totalBoards = boardRows.length;
    const totalAgents = agentIds.filter((id) => agentMap[id]).length;

    const snapshot: WorkspaceContextSnapshot = {
      account_id: accountId,
      assembled_at: new Date(),
      pods: podSummaries,
      total_pods: podSummaries.length,
      total_boards: totalBoards,
      total_agents: totalAgents,
    };

    this.logger.debug(
      `Snapshot assembled in ${Date.now() - start}ms: ${snapshot.total_pods} pods, ${totalBoards} boards, ${totalAgents} agents`,
    );

    return snapshot;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // F008 — Context hash + in-memory cache
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Compute a lightweight hash from MAX(updated_at) across pods, boards, agents.
   * Returns 16 hex chars of SHA-256. Runs in a single query each time.
   */
  async computeContextHash(accountId: string): Promise<string> {
    // Fetch MAX updated_at from the three key tables
    const [podsResult, boardsResult, agentsResult] = await Promise.all([
      this.db
        .select({ updated_at: pods.updatedAt })
        .from(pods)
        .where(eq(pods.accountId, accountId))
        .orderBy(desc(pods.updatedAt))
        .limit(1),
      this.db
        .select({ updated_at: boardInstances.updatedAt })
        .from(boardInstances)
        .where(eq(boardInstances.accountId, accountId))
        .orderBy(desc(boardInstances.updatedAt))
        .limit(1),
      this.db
        .select({ updated_at: agents.updatedAt })
        .from(agents)
        .where(eq(agents.accountId, accountId))
        .orderBy(desc(agents.updatedAt))
        .limit(1),
    ]);

    const timestamps = [
      podsResult[0]?.updated_at ?? '0',
      boardsResult[0]?.updated_at ?? '0',
      agentsResult[0]?.updated_at ?? '0',
    ].join('|');

    return createHash('sha256').update(timestamps).digest('hex').slice(0, 16);
  }

  /**
   * Get a CacheableBlock for the workspace context.
   * On cache hit (same hash): returns cached block without querying DB again.
   * On cache miss: assembles fresh snapshot and populates cache.
   */
  async getContextBlock(accountId: string): Promise<CacheableBlock> {
    const currentHash = await this.computeContextHash(accountId);
    const cached = this.contextCache.get(accountId);

    if (cached && cached.hash === currentHash) {
      this.logger.debug(
        `WorkspaceContext cache HIT for account ${accountId} (hash=${currentHash})`,
      );
      return cached.block;
    }

    this.logger.debug(
      `WorkspaceContext cache MISS for account ${accountId} (hash=${currentHash})`,
    );

    const snapshot = await this.getWorkspaceSnapshot(accountId);
    const block = this.renderContextBlock(snapshot);
    this.contextCache.set(accountId, { hash: currentHash, block });
    return block;
  }

  /**
   * Render a WorkspaceContextSnapshot into a formatted CacheableBlock.
   */
  private renderContextBlock(
    snapshot: WorkspaceContextSnapshot,
  ): CacheableBlock {
    const lines: string[] = [];

    lines.push(`<workspace_context>`);
    lines.push(
      `You are the AI backbone for this workspace's Cockpit. You have full visibility into the workspace structure below.`,
    );
    lines.push(``);

    lines.push(
      `PODS (${snapshot.total_pods} total), BOARDS (${snapshot.total_boards} total), AGENTS (${snapshot.total_agents} total):`,
    );

    for (let i = 0; i < snapshot.pods.length; i++) {
      const pod = snapshot.pods[i];
      lines.push(``);
      lines.push(
        `${i + 1}. ${pod.name}${pod.description ? ` — ${pod.description}` : ''}`,
      );
      lines.push(
        `   pod_id: ${pod.id}${pod.slug ? ` (slug: ${pod.slug})` : ''}`,
      );
      lines.push(
        `   Autonomy Level: ${pod.autonomy_level} (${this.autonomyLabel(pod.autonomy_level)})`,
      );

      if (pod.boards.length > 0) {
        const boardStr = pod.boards
          .map((b) => {
            const desc = b.description ? ` — ${b.description}` : '';
            return `${b.name}${desc} (${b.active_task_count} active tasks)`;
          })
          .join('; ');
        lines.push(`   Boards: ${boardStr}`);
      } else {
        lines.push(`   Boards: (none)`);
      }

      if (pod.agents.length > 0) {
        const agentStr = pod.agents
          .map((a) => `${a.name} (${a.status})`)
          .join(', ');
        lines.push(`   Agents: ${agentStr}`);
      } else {
        lines.push(`   Agents: (none assigned)`);
      }
    }

    lines.push(``);
    lines.push(
      `You can delegate work to these pods using the tools defined below.`,
    );
    lines.push(`</workspace_context>`);

    return {
      text: lines.join('\n'),
      cacheable: true,
    };
  }

  private autonomyLabel(level: number): string {
    switch (level) {
      case 1:
        return 'Observe only';
      case 2:
        return 'Plan & Propose';
      case 3:
        return 'Act with Confirmation';
      case 4:
        return 'Act Autonomously';
      default:
        return 'Unknown';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // F017 — Pod-level context snapshot (getPodContextBlock)
  // ─────────────────────────────────────────────────────────────────────────

  /** In-memory cache for pod context: pod_id → { hash, block } */
  private readonly podContextCache = new Map<string, CacheEntry>();

  /**
   * Compute a hash for a specific pod's context, based on MAX(updated_at)
   * of the pod itself, its boards, tasks, and agents.
   */
  async computePodContextHash(podId: string): Promise<string> {
    const [podResult, boardsResult] = await Promise.all([
      this.db
        .select({ updated_at: pods.updatedAt })
        .from(pods)
        .where(eq(pods.id, podId))
        .limit(1),
      this.db
        .select({ updated_at: boardInstances.updatedAt })
        .from(boardInstances)
        .where(eq(boardInstances.podId, podId))
        .orderBy(desc(boardInstances.updatedAt))
        .limit(1),
    ]);

    const timestamps = [
      podResult[0]?.updated_at ?? '0',
      boardsResult[0]?.updated_at ?? '0',
    ].join('|');

    return createHash('sha256')
      .update(`pod:${podId}:${timestamps}`)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Get a CacheableBlock for a specific pod's context.
   * Assembles pod name/description/autonomy, all boards (with columns + task counts),
   * and all agents in the pod.
   */
  async getPodContextBlock(podId: string): Promise<CacheableBlock> {
    const currentHash = await this.computePodContextHash(podId);
    const cached = this.podContextCache.get(podId);

    if (cached && cached.hash === currentHash) {
      this.logger.debug(
        `PodContext cache HIT for pod ${podId} (hash=${currentHash})`,
      );
      return cached.block;
    }

    this.logger.debug(
      `PodContext cache MISS for pod ${podId} (hash=${currentHash})`,
    );

    const block = await this.assemblePodContextBlock(podId);
    this.podContextCache.set(podId, { hash: currentHash, block });
    return block;
  }

  /**
   * Assemble a <pod_context> XML block with boards, columns, task counts, and agents.
   */
  private async assemblePodContextBlock(
    podId: string,
  ): Promise<CacheableBlock> {
    const start = Date.now();

    // ── 1. Fetch pod ────────────────────────────────────────────────────────
    const pod = await this.db.query.pods.findFirst({
      columns: {
        id: true,
        name: true,
        description: true,
        autonomyLevel: true,
        pilotAgentId: true,
        accountId: true,
      },
      where: eq(pods.id, podId),
    });

    if (!pod) {
      this.logger.error(`Failed to fetch pod ${podId}: not found`);
      throw new Error(`PodContextService: pod ${podId} not found`);
    }

    // ── 2. Fetch boards for this pod ────────────────────────────────────────
    const boardRows = await this.db
      .select({
        id: boardInstances.id,
        name: boardInstances.name,
        description: boardInstances.description,
      })
      .from(boardInstances)
      .where(
        and(
          eq(boardInstances.podId, podId),
          eq(boardInstances.accountId, pod.accountId),
          eq(boardInstances.isArchived, false),
        ),
      );

    const boardIds = boardRows.map((b) => b.id);

    // ── 3. Fetch columns (board_steps) per board ────────────────────────────
    const stepsByBoard: Record<
      string,
      Array<{ name: string; position: number }>
    > = {};
    if (boardIds.length > 0) {
      const steps = await this.db
        .select({
          board_instance_id: boardSteps.boardInstanceId,
          name: boardSteps.name,
          position: boardSteps.position,
        })
        .from(boardSteps)
        .where(inArray(boardSteps.boardInstanceId, boardIds))
        .orderBy(asc(boardSteps.position));

      for (const step of steps) {
        if (!stepsByBoard[step.board_instance_id]) {
          stepsByBoard[step.board_instance_id] = [];
        }
        stepsByBoard[step.board_instance_id].push({
          name: step.name,
          position: step.position,
        });
      }
    }

    // ── 4. Active task counts per board ─────────────────────────────────────
    const taskCounts: Record<string, number> = {};
    if (boardIds.length > 0) {
      const taskData = await this.db
        .select({ board_instance_id: tasks.boardInstanceId })
        .from(tasks)
        .where(
          and(
            inArray(tasks.boardInstanceId, boardIds),
            eq(tasks.accountId, pod.accountId),
            inArray(tasks.status, [
              'pending',
              'in_progress',
              'active',
              'To-Do',
              'AI Running',
              'In Review',
            ]),
          ),
        );

      for (const t of taskData) {
        if (t.board_instance_id) {
          taskCounts[t.board_instance_id] =
            (taskCounts[t.board_instance_id] || 0) + 1;
        }
      }
    }

    // ── 5. Collect agent IDs (pilot + board_step default agents) ────────────
    const agentIdSet = new Set<string>();
    if (pod.pilotAgentId) agentIdSet.add(pod.pilotAgentId);

    if (boardIds.length > 0) {
      const stepAgents = await this.db
        .select({ default_agent_id: boardSteps.defaultAgentId })
        .from(boardSteps)
        .where(
          and(
            inArray(boardSteps.boardInstanceId, boardIds),
            isNotNull(boardSteps.defaultAgentId),
          ),
        );

      for (const sa of stepAgents) {
        if (sa.default_agent_id) agentIdSet.add(sa.default_agent_id);
      }
    }

    // ── 6. Fetch agent details + skills ─────────────────────────────────────
    const agentIds = Array.from(agentIdSet);
    let agentSummaries: AgentSummary[] = [];

    if (agentIds.length > 0) {
      const agentRows = await this.db
        .select({
          id: agents.id,
          name: agents.name,
          status: agents.status,
        })
        .from(agents)
        .where(
          and(
            inArray(agents.id, agentIds),
            eq(agents.accountId, pod.accountId),
            eq(agents.isActive, true),
          ),
        );

      if (agentRows.length > 0) {
        // Fetch skills
        const agentSkillRows = await this.db.query.agentSkills.findMany({
          where: and(
            inArray(agentSkills.agentId, agentIds),
            eq(agentSkills.isActive, true),
          ),
          with: { skill: { columns: { name: true } } },
        });

        const skillsByAgent: Record<string, string[]> = {};
        for (const as of agentSkillRows) {
          if (!skillsByAgent[as.agentId]) skillsByAgent[as.agentId] = [];
          const skillName = (as.skill as any)?.name;
          if (skillName) skillsByAgent[as.agentId].push(skillName);
        }

        agentSummaries = agentRows.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          skills: skillsByAgent[a.id] ?? [],
        }));
      }
    }

    // ── 7. Render <pod_context> block ─────────────────────────────────────
    const lines: string[] = [];
    lines.push(`<pod_context>`);
    lines.push(
      `You are the AI backbone for the ${pod.name} pod. You have full visibility into your department below.`,
    );
    lines.push(``);

    lines.push(`BOARDS (${boardRows.length} total):`);
    for (let i = 0; i < boardRows.length; i++) {
      const board = boardRows[i];
      const desc = board.description ? ` — ${board.description}` : '';
      lines.push(`${i + 1}. ${board.name}${desc}`);

      const cols = stepsByBoard[board.id] ?? [];
      if (cols.length > 0) {
        lines.push(`   Columns: ${cols.map((c) => c.name).join(' → ')}`);
      } else {
        lines.push(`   Columns: (none configured)`);
      }
      lines.push(`   Active tasks: ${taskCounts[board.id] || 0}`);
    }

    lines.push(``);
    lines.push(`AGENTS:`);
    if (agentSummaries.length > 0) {
      for (const agent of agentSummaries) {
        const skillsStr =
          agent.skills.length > 0
            ? ` — Skills: ${agent.skills.join(', ')}`
            : '';
        lines.push(`- ${agent.name} (${agent.status})${skillsStr}`);
      }
    } else {
      lines.push(`- (no agents assigned to this pod)`);
    }

    lines.push(``);
    lines.push(
      `Your autonomy level: ${pod.autonomyLevel ?? 1} (${this.autonomyLabel(pod.autonomyLevel ?? 1)})`,
    );
    lines.push(
      `You can use the tools below to create tasks, trigger boards, and escalate to the workspace.`,
    );
    lines.push(`</pod_context>`);

    this.logger.debug(
      `PodContext assembled in ${Date.now() - start}ms for pod "${pod.name}" (${boardRows.length} boards, ${agentSummaries.length} agents)`,
    );

    return {
      text: lines.join('\n'),
      cacheable: true,
    };
  }
}
