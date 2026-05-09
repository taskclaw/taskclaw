import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { SupabaseAdminService } from '../../supabase/supabase-admin.service';

export function createQueryBoardTasksTool(
  supabaseAdmin: SupabaseAdminService,
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
        const client = supabaseAdmin.getClient();

        // 1. Find the board instance by name (ILIKE)
        const { data: boards, error: boardError } = await client
          .from('board_instances')
          .select('id, name')
          .eq('account_id', accountId)
          .ilike('name', `%${board_name}%`)
          .limit(1);

        if (boardError) {
          return JSON.stringify({ error: `Board lookup error: ${boardError.message}` });
        }

        if (!boards || boards.length === 0) {
          return JSON.stringify({
            error: `No board found matching "${board_name}" for this account.`,
          });
        }

        const board = boards[0];

        // 2. Optionally find the step
        let stepId: string | null = null;
        if (step_name) {
          const { data: steps, error: stepError } = await client
            .from('board_steps')
            .select('id, name')
            .eq('board_instance_id', board.id)
            .ilike('name', `%${step_name}%`)
            .limit(1);

          if (stepError) {
            return JSON.stringify({ error: `Step lookup error: ${stepError.message}` });
          }

          if (!steps || steps.length === 0) {
            return JSON.stringify({
              error: `No step found matching "${step_name}" in board "${board.name}".`,
            });
          }

          stepId = steps[0].id;
        }

        // 3. Query tasks
        let taskQuery = client
          .from('tasks')
          .select(
            'id, title, input_fields, output_fields, metadata, step_id, board_step:board_steps(name)',
          )
          .eq('board_instance_id', board.id);

        if (stepId) {
          taskQuery = taskQuery.eq('step_id', stepId);
        }

        if (search_query) {
          taskQuery = taskQuery.ilike('title', `%${search_query}%`);
        }

        const { data: tasks, error: taskError } = await taskQuery.limit(50);

        if (taskError) {
          return JSON.stringify({ error: `Task query error: ${taskError.message}` });
        }

        const formattedTasks = (tasks || []).map((t: any) => ({
          id: t.id,
          title: t.title,
          input_fields: t.input_fields,
          output_fields: t.output_fields,
          metadata: t.metadata,
          step_name: t.board_step?.name ?? null,
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
