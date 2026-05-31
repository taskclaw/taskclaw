import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { and, eq, ilike } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { boardInstances, boardSteps, tasks } from '../../db/schema';

export function createQueryBoardTasksTool(
  db: Db,
  accountId: string,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'query_board_tasks',
    description:
      'Query tasks from a TaskClaw board by board name, optionally filtered by step name or a search query on title/fields. Use this to read workflow task data for the current account.',
    schema: z.object({
      board_name: z
        .string()
        .describe('The board name to search for (partial match, case-insensitive).'),
      step_name: z
        .string()
        .optional()
        .describe(
          'Optional step/column name to filter tasks by (partial match, case-insensitive).',
        ),
      search_query: z
        .string()
        .optional()
        .describe(
          'Optional search string to filter tasks by title (case-insensitive).',
        ),
    }),
    func: async ({ board_name, step_name, search_query }) => {
      try {
        // 1. Find the board instance by name (ILIKE)
        const boards = await db
          .select({ id: boardInstances.id, name: boardInstances.name })
          .from(boardInstances)
          .where(
            and(
              eq(boardInstances.accountId, accountId),
              ilike(boardInstances.name, `%${board_name}%`),
            ),
          )
          .limit(1);

        if (!boards || boards.length === 0) {
          return JSON.stringify({
            error: `No board found matching "${board_name}" for this account.`,
          });
        }

        const board = boards[0];

        // 2. Optionally find the step
        let stepId: string | null = null;
        if (step_name) {
          const steps = await db
            .select({ id: boardSteps.id, name: boardSteps.name })
            .from(boardSteps)
            .where(
              and(
                eq(boardSteps.boardInstanceId, board.id),
                ilike(boardSteps.name, `%${step_name}%`),
              ),
            )
            .limit(1);

          if (!steps || steps.length === 0) {
            return JSON.stringify({
              error: `No step found matching "${step_name}" in board "${board.name}".`,
            });
          }

          stepId = steps[0].id;
        }

        // 3. Query tasks. The PostgREST embed `board_step:board_steps(name)`
        // re-keys to the Drizzle `boardStep` relation (tasks.currentStepId →
        // board_steps). PostgREST's `step_id` filter maps to `currentStepId`.
        const taskConds = [eq(tasks.boardInstanceId, board.id)];
        if (stepId) taskConds.push(eq(tasks.currentStepId, stepId));
        if (search_query) taskConds.push(ilike(tasks.title, `%${search_query}%`));

        const taskRows = await db.query.tasks.findMany({
          with: {
            boardStep: true,
          },
          where: and(...taskConds),
          limit: 50,
        });

        const formattedTasks = (taskRows ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          // The migrated `tasks` table has no `input_fields`/`output_fields`
          // columns; the field schema now lives on the step. Preserve the
          // original output keys by surfacing the step's field definitions.
          input_fields: t.boardStep?.inputFields ?? null,
          output_fields: t.boardStep?.outputFields ?? null,
          metadata: t.metadata,
          step_name: t.boardStep?.name ?? null,
        }));

        return JSON.stringify({
          board_id: board.id,
          board_name: board.name,
          task_count: formattedTasks.length,
          tasks: formattedTasks,
        });
      } catch (e: any) {
        return JSON.stringify({ error: e.message });
      }
    },
  });
}
