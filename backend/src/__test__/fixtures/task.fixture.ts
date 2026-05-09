/**
 * Task fixture factory — returns a minimal valid task DB row.
 */

export function taskFixture(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-uuid-001',
    title: 'Test task',
    notes: null,
    status: 'To Do',
    completed: false,
    completed_at: null,
    board_instance_id: 'board-uuid-001',
    current_step_id: null,
    dag_id: null,
    account_id: 'account-uuid-001',
    backbone_connection_id: null,
    result: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  completed: boolean;
  completed_at: string | null;
  board_instance_id: string | null;
  current_step_id: string | null;
  dag_id: string | null;
  account_id: string;
  backbone_connection_id: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}
