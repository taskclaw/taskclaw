import { Injectable, Logger, Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Db } from '../db';
import {
  boardInstances,
  boardSteps,
  agents,
  taskDags,
  tasks,
  taskDependencies,
} from '../db/schema';
import { BackboneRouterService } from '../backbone/backbone-router.service';

@Injectable()
export class CoordinatorService {
  private readonly logger = new Logger(CoordinatorService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly backboneRouter: BackboneRouterService,
  ) {}

  /**
   * Drizzle's relational query returns the embedded board steps under the
   * relation name (`boardSteps`); PostgREST returned them under the table name
   * (`board_steps`). Re-key to `board_steps` so the response shape the prompt
   * builder depends on is unchanged.
   */
  private presentBoard(row: any) {
    const { boardSteps: steps, ...rest } = row;
    return { ...rest, board_steps: steps ?? [] };
  }

  async decomposeGoal(options: {
    accountId: string;
    podId?: string;
    goal: string;
    conversationId?: string;
  }) {
    // 1. Fetch available boards (filtered by podId if provided)
    const boardRows = await this.db.query.boardInstances.findMany({
      where: options.podId
        ? and(
            eq(boardInstances.accountId, options.accountId),
            eq(boardInstances.podId, options.podId),
          )
        : eq(boardInstances.accountId, options.accountId),
      columns: { id: true, name: true },
      with: {
        boardSteps: {
          columns: {
            id: true,
            name: true,
            position: true,
            defaultAgentId: true,
          },
        },
      },
    });
    const boards = boardRows.map((b) => this.presentBoard(b));

    // 1b. Fetch available agents for this account (F11)
    const agentRows = await this.db
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        agent_type: agents.agentType,
        status: agents.status,
      })
      .from(agents)
      .where(
        and(
          eq(agents.accountId, options.accountId),
          eq(agents.isActive, true),
        ),
      );

    // 2. Build system prompt describing available boards and agents
    const boardDescriptions =
      boards
        ?.map(
          (b: any) =>
            `Board: "${b.name}" (id: ${b.id})\n  Columns: ${b.board_steps?.map((s: any) => `"${s.name}" (id: ${s.id})${s.defaultAgentId ? ` [agent: ${s.defaultAgentId}]` : ''}`).join(', ')}`,
        )
        .join('\n') ?? 'No boards available';

    const agentDescriptions =
      agentRows && agentRows.length > 0
        ? agentRows
            .map(
              (a: any) =>
                `### ${a.name} (ID: ${a.id})\nType: ${a.agent_type}\nStatus: ${a.status}\nDescription: ${a.description || 'General purpose agent'}`,
            )
            .join('\n\n')
        : 'No agents configured';

    const systemPrompt = `You are a task coordinator. Given a high-level goal, decompose it into specific tasks assigned to boards and columns.
Available boards and columns:
${boardDescriptions}

Available Agents:
${agentDescriptions}

Respond with ONLY valid JSON in this format:
{
  "tasks": [
    {
      "title": "Task title",
      "description": "Task description",
      "board_id": "uuid",
      "step_id": "uuid",
      "assignee_agent_id": "uuid or null",
      "depends_on_indexes": []
    }
  ]
}

For each task, set "assignee_agent_id" to the agent best suited for the work based on their description.
If unsure or the column has a default agent, set "assignee_agent_id" to null — the system will auto-assign.
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
    let dag: typeof taskDags.$inferSelect;
    try {
      const createdDags = await this.db
        .insert(taskDags)
        .values({
          accountId: options.accountId,
          podId: options.podId ?? null,
          goal: options.goal,
          status: 'pending_approval',
          createdBy: 'pod_agent',
          conversationId: options.conversationId ?? null,
        })
        .returning();
      dag = createdDags[0];
    } catch (dagError) {
      throw new Error(
        `Failed to create task DAG: ${(dagError as Error).message}`,
      );
    }

    // 6. Create tasks
    const createdTaskIds: string[] = [];
    for (const taskSpec of parsed.tasks) {
      // F11: Resolve assignee — explicit from decomposition, else check column default
      let assigneeType = 'none';
      let assigneeId: string | null = null;

      if (taskSpec.assignee_agent_id) {
        assigneeType = 'agent';
        assigneeId = taskSpec.assignee_agent_id;
      } else if (taskSpec.step_id) {
        // Check if the column has a default agent
        const [step] = await this.db
          .select({ defaultAgentId: boardSteps.defaultAgentId })
          .from(boardSteps)
          .where(eq(boardSteps.id, taskSpec.step_id))
          .limit(1);
        if (step?.defaultAgentId) {
          assigneeType = 'agent';
          assigneeId = step.defaultAgentId;
        }
      }

      let task: typeof tasks.$inferSelect;
      try {
        const createdTasks = await this.db
          .insert(tasks)
          .values({
            accountId: options.accountId,
            boardInstanceId: taskSpec.board_id,
            currentStepId: taskSpec.step_id,
            title: taskSpec.title,
            notes: taskSpec.description ?? '',
            dagId: dag.id,
            status: 'To-Do',
            assigneeType,
            assigneeId,
          })
          .returning();
        task = createdTasks[0];
      } catch (taskError) {
        this.logger.error(
          `Failed to create task "${taskSpec.title}": ${(taskError as Error).message}`,
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
          await this.db.insert(taskDependencies).values({
            sourceTaskId: createdTaskIds[depIndex],
            targetTaskId: createdTaskIds[i],
            dependencyType: 'dag',
            dagId: dag.id,
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
