export interface Pod {
  id: string
  account_id: string
  name: string
  slug: string
  description?: string
  icon: string
  color: string
  backbone_connection_id?: string | null
  agent_config: Record<string, any>
  position: number
  board_count?: number
  autonomy_level?: number
  created_at: string
  updated_at?: string
}

export type CreatePodPayload = {
  name: string
  slug?: string
  description?: string
  icon?: string
  color?: string
  backbone_connection_id?: string
  agent_config?: Record<string, any>
  position?: number
  autonomy_level?: number
}

export type UpdatePodPayload = Partial<CreatePodPayload>

export interface HeartbeatConfig {
  id: string
  account_id: string
  pod_id?: string | null
  board_id?: string | null
  name: string
  schedule: string
  prompt: string
  is_active: boolean
  dry_run: boolean
  max_tasks_per_run: number
  circuit_breaker_threshold: number
  consecutive_failures: number
  last_run_at?: string | null
  last_run_status?: 'success' | 'error' | 'skipped' | 'running' | null
  created_at: string
}

export interface ExecutionLog {
  id: string
  account_id: string
  trigger_type: 'heartbeat' | 'dag_step' | 'route_transfer' | 'tool_execution' | 'coordinator' | 'manual' | 'workspace_chat'
  status: 'success' | 'error' | 'skipped' | 'running' | 'timeout' | 'dry_run'
  pod_id?: string | null
  board_id?: string | null
  summary?: string | null
  error_details?: string | null
  duration_ms?: number | null
  metadata?: Record<string, any>
  conversation_id?: string | null
  started_at: string
  completed_at?: string | null
}

export interface BoardRoute {
  id: string
  account_id: string
  source_board_id: string
  source_step_id?: string | null
  target_board_id: string
  target_step_id?: string | null
  trigger: 'auto' | 'ai_decision' | 'manual' | 'error' | 'fallback'
  label?: string | null
  pod_id?: string | null
  transform_config: Record<string, any>
  is_active: boolean
  created_at: string
}

export interface TaskDAG {
  id: string
  account_id: string
  pod_id?: string | null
  goal: string
  status: 'pending_approval' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  created_by: string
  created_at: string
  completed_at?: string | null
}

export interface TaskDependency {
  id: string
  source_task_id: string
  target_task_id: string
  dependency_type: 'route' | 'dag' | 'manual'
  dag_id?: string | null
}
