import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { BackboneRouterService } from '../backbone/backbone-router.service';

@Injectable()
export class DAGExecutorService {
  private readonly logger = new Logger(DAGExecutorService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly backboneRouter: BackboneRouterService,
  ) {}

  /**
   * BE12: Execute an approved DAG by finding root tasks (no upstream deps)
   * and running them against the backbone. Uses cascading onTaskCompleted
   * to execute downstream tasks when upstreams complete.
   */
  async startDag(dagId: string): Promise<void> {
    const client = this.supabaseAdmin.getClient();

    // Fetch the DAG to get account_id
    const { data: dag, error: dagError } = await client
      .from('task_dags')
      .select('id, account_id, goal, status')
      .eq('id', dagId)
      .single();

    if (dagError || !dag) {
      this.logger.error(`startDag: DAG ${dagId} not found`);
      return;
    }

    // Fetch all tasks in this DAG
    const { data: allTasks } = await client
      .from('tasks')
      .select('id, title, notes, board_instance_id, completed')
      .eq('dag_id', dagId);

    if (!allTasks?.length) {
      this.logger.warn(`startDag: No tasks found in DAG ${dagId}`);
      return;
    }

    // Find tasks with no upstream dependencies (roots)
    const { data: allDeps } = await client
      .from('task_dependencies')
      .select('target_task_id')
      .eq('dag_id', dagId);

    const tasksWithUpstreams = new Set(
      (allDeps ?? []).map((d: any) => d.target_task_id),
    );

    const rootTasks = allTasks.filter(
      (t: any) => !tasksWithUpstreams.has(t.id) && !t.completed,
    );

    if (!rootTasks.length) {
      this.logger.log(`startDag: No root tasks to execute for DAG ${dagId}`);
      return;
    }

    this.logger.log(
      `startDag: Executing ${rootTasks.length} root task(s) for DAG ${dagId}`,
    );

    // Execute root tasks in batches of 3 (max concurrency)
    const BATCH_SIZE = 3;
    for (let i = 0; i < rootTasks.length; i += BATCH_SIZE) {
      const batch = rootTasks.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (task: any) => {
          try {
            const message =
              task.title + (task.notes ? '\n\n' + task.notes : '');

            const result = await this.backboneRouter.send({
              accountId: dag.account_id,
              boardId: task.board_instance_id ?? undefined,
              sendOptions: {
                message,
                systemPrompt: 'You are an AI task executor. Complete the task described.',
              },
            });

            const resultText = result.text ?? '';

            // Store result and mark completed — triggers cascade via onTaskCompleted
            await client
              .from('tasks')
              .update({
                result: resultText,
                completed: true,
                completed_at: new Date().toISOString(),
              })
              .eq('id', task.id);

            // Trigger cascade
            await this.onTaskCompleted(task.id, resultText);

            this.logger.log(
              `startDag: Task ${task.id} "${task.title}" completed`,
            );
          } catch (err) {
            this.logger.error(
              `startDag: Task ${task.id} failed: ${(err as Error).message}`,
            );
            await this.onTaskFailed(task.id, (err as Error).message);
          }
        }),
      );
    }
  }

  async onTaskCompleted(taskId: string, result?: any) {
    const client = this.supabaseAdmin.getClient();

    // Store result if provided
    if (result) {
      await client.from('tasks').update({ result }).eq('id', taskId);
    }

    // Find downstream tasks
    const { data: deps } = await client
      .from('task_dependencies')
      .select('target_task_id, dag_id')
      .eq('source_task_id', taskId);

    if (!deps?.length) return;

    for (const dep of deps) {
      // Check if ALL upstreams of this downstream task are completed
      const { data: allUpstreamDeps } = await client
        .from('task_dependencies')
        .select('source_task_id')
        .eq('target_task_id', dep.target_task_id);

      if (!allUpstreamDeps?.length) continue;

      const { data: upstreamTasks } = await client
        .from('tasks')
        .select('id, status, completed')
        .in(
          'id',
          allUpstreamDeps.map((d) => d.source_task_id),
        );

      const allDone = upstreamTasks?.every(
        (t) => t.completed === true || t.status === 'Done',
      );

      if (allDone) {
        this.logger.log(
          `All dependencies met for task ${dep.target_task_id}, marking as In Progress`,
        );
        await client
          .from('tasks')
          .update({ status: 'In Progress' })
          .eq('id', dep.target_task_id);
      }
    }

    // Check if the DAG is fully complete
    if (deps[0]?.dag_id) {
      await this.checkDagCompletion(deps[0].dag_id);
    }
  }

  async onTaskFailed(taskId: string, error: string) {
    const client = this.supabaseAdmin.getClient();

    // BFS to find all downstream tasks and mark as blocked
    const visited = new Set<string>();
    const queue = [taskId];

    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const { data: deps } = await client
        .from('task_dependencies')
        .select('target_task_id')
        .eq('source_task_id', current);

      for (const dep of deps ?? []) {
        if (!visited.has(dep.target_task_id)) {
          await client
            .from('tasks')
            .update({
              status: 'Blocked',
            })
            .eq('id', dep.target_task_id);
          queue.push(dep.target_task_id);
        }
      }
    }
  }

  private async checkDagCompletion(dagId: string) {
    const client = this.supabaseAdmin.getClient();

    // Get all tasks in this DAG
    const { data: dagTasks } = await client
      .from('tasks')
      .select('id, completed, status')
      .eq('dag_id', dagId);

    if (!dagTasks?.length) return;

    const allCompleted = dagTasks.every(
      (t) => t.completed === true || t.status === 'Done',
    );

    if (allCompleted) {
      this.logger.log(`DAG ${dagId} fully completed`);
      await client
        .from('task_dags')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', dagId);
    }
  }
}
