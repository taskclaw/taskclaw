import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DB, type Db } from '../db';
import { tasks, taskDependencies, taskDags } from '../db/schema';

@Injectable()
export class DAGExecutorService {
  private readonly logger = new Logger(DAGExecutorService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async onTaskCompleted(taskId: string, result?: any) {
    // Store result if provided
    if (result) {
      await this.db.update(tasks).set({ result }).where(eq(tasks.id, taskId));
    }

    // Find downstream tasks
    const deps = await this.db
      .select({
        target_task_id: taskDependencies.targetTaskId,
        dag_id: taskDependencies.dagId,
      })
      .from(taskDependencies)
      .where(eq(taskDependencies.sourceTaskId, taskId));

    if (!deps?.length) return;

    for (const dep of deps) {
      // Check if ALL upstreams of this downstream task are completed
      const allUpstreamDeps = await this.db
        .select({ source_task_id: taskDependencies.sourceTaskId })
        .from(taskDependencies)
        .where(eq(taskDependencies.targetTaskId, dep.target_task_id));

      if (!allUpstreamDeps?.length) continue;

      const upstreamTasks = await this.db
        .select({
          id: tasks.id,
          status: tasks.status,
          completed: tasks.completed,
        })
        .from(tasks)
        .where(
          inArray(
            tasks.id,
            allUpstreamDeps.map((d) => d.source_task_id),
          ),
        );

      const allDone = upstreamTasks?.every(
        (t) => t.completed === true || t.status === 'Done',
      );

      if (allDone) {
        this.logger.log(
          `All dependencies met for task ${dep.target_task_id}, marking as In Progress`,
        );
        await this.db
          .update(tasks)
          .set({ status: 'In Progress' })
          .where(eq(tasks.id, dep.target_task_id));
      }
    }

    // Check if the DAG is fully complete
    if (deps[0]?.dag_id) {
      await this.checkDagCompletion(deps[0].dag_id);
    }
  }

  async onTaskFailed(taskId: string, error: string) {
    // BFS to find all downstream tasks and mark as blocked
    const visited = new Set<string>();
    const queue = [taskId];

    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = await this.db
        .select({ target_task_id: taskDependencies.targetTaskId })
        .from(taskDependencies)
        .where(eq(taskDependencies.sourceTaskId, current));

      for (const dep of deps ?? []) {
        if (!visited.has(dep.target_task_id)) {
          await this.db
            .update(tasks)
            .set({
              status: 'Blocked',
            })
            .where(eq(tasks.id, dep.target_task_id));
          queue.push(dep.target_task_id);
        }
      }
    }
  }

  private async checkDagCompletion(dagId: string) {
    // Get all tasks in this DAG
    const dagTasks = await this.db
      .select({
        id: tasks.id,
        completed: tasks.completed,
        status: tasks.status,
      })
      .from(tasks)
      .where(eq(tasks.dagId, dagId));

    if (!dagTasks?.length) return;

    const allCompleted = dagTasks.every(
      (t) => t.completed === true || t.status === 'Done',
    );

    if (allCompleted) {
      this.logger.log(`DAG ${dagId} fully completed`);
      await this.db
        .update(taskDags)
        .set({
          status: 'completed',
          completedAt: new Date().toISOString(),
        })
        .where(eq(taskDags.id, dagId));
    }
  }
}
