import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

@Injectable()
export class DAGExecutorService {
  private readonly logger = new Logger(DAGExecutorService.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

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
