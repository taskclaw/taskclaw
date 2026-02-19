export interface Task {
  id: string
  title: string
  status: string | null
  category: string | null
  category_id: string | null
  priority: string | null
  completed: boolean
  horizon: string | null
  due_date: string | null
  notes: string | null
  time_spent: number | null
  source_id: string | null
  external_id: string | null
  external_url: string | null
  account_id: string
  created_at: string
  updated_at: string
  metadata?: Record<string, any>
  // Joined from sources table
  sources?: {
    id: string
    provider: string
  } | null
  // Joined from categories table
  categories?: {
    id: string
    name: string
    color: string | null
    icon: string | null
  } | null
}

export interface Category {
  id: string
  name: string
  color: string | null
  account_id: string
  visible?: boolean
}

export type TaskStatus = 'To-Do' | 'Today' | 'In Progress' | 'AI Running' | 'In Review' | 'Done'
export type TaskPriority = 'High' | 'Medium' | 'Low'

export const KANBAN_COLUMNS: TaskStatus[] = ['To-Do', 'Today', 'In Progress', 'AI Running', 'In Review', 'Done']

export const STATUS_COLORS: Record<string, string> = {
  'To-Do': '#71717a',
  Today: '#3b82f6',
  'In Progress': '#F06050',
  'AI Running': '#E63B3B',
  'In Review': '#a855f7',
  Done: '#22c55e',
}

export const PRIORITY_COLORS: Record<string, string> = {
  High: '#ef4444',
  Medium: '#f59e0b',
  Low: '#22c55e',
}

export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  Pessoal: '#6366f1',
  '8FAI': '#22c55e',
  Microfactory: '#ec4899',
  Polen: '#a855f7',
  KeHE: '#eab308',
}
