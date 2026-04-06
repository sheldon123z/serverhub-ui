/** Task Management System — 前端类型定义 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed'
export type TaskType = 'shell' | 'agent' | 'subagent'

export interface TaskItem {
  id: string
  name: string
  description: string
  task_type: TaskType
  status: TaskStatus
  assignee?: string
  blocked_by: string[]
  output?: string
  start_time?: string
  end_time?: string
  _justCompleted?: boolean
}

export const TERMINAL_TASK_STATUSES: TaskStatus[] = ['completed', 'failed', 'killed']

export function isTerminalTaskStatus(s: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(s)
}
