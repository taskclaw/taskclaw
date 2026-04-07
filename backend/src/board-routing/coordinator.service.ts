import { Injectable, Logger } from '@nestjs/common';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { BackboneRouterService } from '../backbone/backbone-router.service';

@Injectable()
export class CoordinatorService {
  private readonly logger = new Logger(CoordinatorService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly backboneRouter: BackboneRouterService,
  ) {}

  async decomposeGoal(options: {
    accountId: string;
    podId?: string;
    goal: string;
    conversationId?: string;
  }) {
    const client = this.supabaseAdmin.getClient();

    // 1. Fetch available boards (filtered by podId if provided)
    let boardsQuery = client
      .from('board_instances')
      .select('id, name, board_steps(id, name, position)')
      .eq('account_id', options.accountId);
    if (options.podId) {
      boardsQuery = boardsQuery.eq('pod_id', options.podId);
    }
    const { data: boards } = await boardsQuery;

    // 2. Build system prompt describing available boards
    const boardDescriptions =
      boards
        ?.map(
          (b: any) =>
            `Board: "${b.name}" (id: ${b.id})\n  Columns: ${b.board_steps?.map((s: any) => `"${s.name}" (id: ${s.id})`).join(', ')}`,
        )
        .join('\n') ?? 'No boards available';

    const systemPrompt = `You are a task coordinator. Given a high-level goal, decompose it into specific tasks assigned to boards and columns.
Available boards and columns:
${boardDescriptions}

Respond with ONLY valid JSON in this format:
{
  "tasks": [
    {
      "title": "Task title",
      "description": "Task description",
      "board_id": "uuid",
      "step_id": "uuid",
      "depends_on_indexes": []
    }
  ]
}

Each depends_on_indexes is an array of 0-based indexes of tasks this task depends on.`;

    // 3. Send to backbone
    let responseText = '';
    try {
      const result = await this.backboneRouter.send({
        accountId: options.accountId,
        sendOptions: {
          message: `Decompose this goal into tasks: ${options.goal}`,
          systemPrompt,
          history: [],
        },
      });
      responseText = result.text;
    } catch (err) {
      throw new Error(
        `Backbone unavailable for goal decomposition: ${(err as Error).message}`,
      );
    }

    // 4. Parse JSON response (handle markdown code blocks)
    let parsed: { tasks: any[] };
    try {
      const jsonMatch =
        responseText.match(/```json\n?([\s\S]*?)\n?```/) ||
        responseText.match(/(\{[\s\S]*\})/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[1] : responseText);
    } catch {
      throw new Error(
        `Could not parse backbone response as task DAG JSON: ${responseText.slice(0, 200)}`,
      );
    }

    if (!parsed.tasks?.length) {
      throw new Error('No tasks in decomposition response');
    }

    // 5. Create task_dag record
    const { data: dag, error: dagError } = await client
      .from('task_dags')
      .insert({
        account_id: options.accountId,
        pod_id: options.podId ?? null,
        goal: options.goal,
        status: 'pending_approval',
        created_by: 'pod_agent',
        conversation_id: options.conversationId ?? null,
      })
      .select()
      .single();

    if (dagError) {
      throw new Error(`Failed to create task DAG: ${dagError.message}`);
    }

    // 6. Create tasks
    const createdTaskIds: string[] = [];
    for (const taskSpec of parsed.tasks) {
      const { data: task, error: taskError } = await client
        .from('tasks')
        .insert({
          account_id: options.accountId,
          board_instance_id: taskSpec.board_id,
          current_step_id: taskSpec.step_id,
          title: taskSpec.title,
          notes: taskSpec.description ?? '',
          dag_id: dag.id,
          status: 'To-Do',
        })
        .select()
        .single();

      if (taskError) {
        this.logger.error(
          `Failed to create task "${taskSpec.title}": ${taskError.message}`,
        );
        continue;
      }

      createdTaskIds.push(task.id);
    }

    // 7. Create task_dependencies
    for (let i = 0; i < parsed.tasks.length; i++) {
      const taskSpec = parsed.tasks[i];
      for (const depIndex of taskSpec.depends_on_indexes ?? []) {
        if (depIndex < createdTaskIds.length && depIndex < i) {
          await client.from('task_dependencies').insert({
            source_task_id: createdTaskIds[depIndex],
            target_task_id: createdTaskIds[i],
            dependency_type: 'dag',
            dag_id: dag.id,
          });
        }
      }
    }

    this.logger.log(
      `Goal decomposed into ${createdTaskIds.length} tasks for DAG ${dag.id}`,
    );

    return { dag, taskIds: createdTaskIds };
  }
}
