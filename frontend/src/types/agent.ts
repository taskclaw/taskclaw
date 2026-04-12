export type AgentStatus = 'idle' | 'working' | 'paused' | 'error' | 'offline'
export type AgentType = 'worker' | 'pilot' | 'coordinator'

export interface Agent {
  id: string
  account_id: string
  name: string
  slug: string
  avatar_url: string | null
  description: string | null
  persona: string | null
  color: string | null
  backbone_connection_id: string | null
  model_override: string | null
  max_concurrent_tasks: number
  status: AgentStatus
  is_active: boolean
  agent_type: AgentType
  total_tasks_completed: number
  total_tasks_failed: number
  total_tokens_used: number
  last_active_at: string | null
  config: Record<string, any>
  migrated_from_category_id: string | null
  created_at: string
  updated_at: string
}

export interface AgentActivity {
  id: string
  account_id: string
  agent_id: string
  activity_type:
    | 'task_completed'
    | 'task_failed'
    | 'task_assigned'
    | 'conversation_reply'
    | 'dag_created'
    | 'route_triggered'
    | 'status_changed'
    | 'error'
  task_id: string | null
  dag_id: string | null
  conversation_id: string | null
  board_id: string | null
  summary: string
  metadata: Record<string, any>
  created_at: string
}

export interface CreateAgentInput {
  name: string
  description?: string
  persona?: string
  color?: string
  agent_type?: AgentType
  backbone_connection_id?: string
  model_override?: string
  max_concurrent_tasks?: number
  config?: Record<string, any>
}

export interface UpdateAgentInput extends Partial<CreateAgentInput> {
  status?: AgentStatus
  is_active?: boolean
}
