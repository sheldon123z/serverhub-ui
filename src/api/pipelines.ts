/**
 * Pipeline 编排引擎 — API 层
 *
 * TypeScript 类型定义 + API 调用封装
 * API 前缀: /api/pipelines
 */

import client from '@/api/client'

/* ─── 类型定义 ─── */

export interface StepDefinition {
  id: string
  type:
    | 'shell'
    | 'ssh'
    | 'playbook'
    | 'agent'
    | 'approval'
    | 'condition'
    | 'parallel'
    | 'notify'
    | 'http'
    | 'delay'
  name: string
  [key: string]: unknown
}

export interface PipelineParam {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'secret'
  required?: boolean
  default?: unknown
  description?: string
}

export interface Pipeline {
  id: string
  name: string
  display_name: string
  description: string
  yaml_content: string
  steps_json: string
  params_json: string
  trigger_json: string
  version: number
  max_concurrent_runs: number
  timeout: number
  enabled: number
  created_by: string
  created_at: string
  updated_at: string
}

export type RunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface PipelineRun {
  id: string
  pipeline_id: string
  pipeline_version: number
  status: RunStatus
  params_json: string
  current_step_id: string | null
  steps_state_json: string
  trigger_type: string
  started_at: string
  completed_at: string | null
  started_by: string
  error: string | null
  summary: string | null
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface StepLog {
  id: number
  run_id: string
  step_id: string
  step_type: string
  status: StepStatus
  started_at: string | null
  completed_at: string | null
  input_json: string | null
  output_json: string | null
  error: string | null
  duration_ms: number | null
}

export interface PipelineChatEvent {
  id: number
  run_id: string
  event_id: string
  seq: number
  event_type: string
  step_id: string | null
  message_id: string | null
  tool_call_id: string | null
  role: string | null
  content: string | null
  metadata_json: string
  created_at: string
}

export type PipelineSSEEventType =
  | 'step_start'
  | 'step_complete'
  | 'step_failed'
  | 'step_retry'
  | 'approval_required'
  | 'agent_start'
  | 'agent_message'
  | 'agent_tool_call'
  | 'agent_tool_result'
  | 'agent_complete'
  | 'chat_message'
  | 'chat_tool_call'
  | 'chat_tool_result'
  | 'decision_request'
  | 'pipeline_complete'

export interface PipelineSSEEvent {
  event_id: string
  seq: number
  timestamp: number
  type: PipelineSSEEventType
  step_id?: string
  message_id?: string
  tool_call_id?: string
  role?: string
  content?: string
  final?: boolean
  tool?: string
  args?: Record<string, unknown>
  step_name?: string
  step_type?: string
  status?: string
  duration_ms?: number
  error?: string
  total_duration?: number
  summary?: string
}

export interface ValidationResult {
  valid: boolean
  errors?: string[]
}

/* ─── API 调用 ─── */

export const pipelinesApi = {
  // Pipeline 定义 CRUD
  list: (params?: { enabled?: boolean; search?: string }) =>
    client.get<Pipeline[]>('/api/pipelines', { params }),

  create: (yaml_content: string) =>
    client.post<{ ok: true; id: string }>('/api/pipelines', { yaml_content }),

  get: (id: string) => client.get<Pipeline>(`/api/pipelines/${id}`),

  update: (id: string, yaml_content: string) =>
    client.put<{ ok: true; version: number }>(`/api/pipelines/${id}`, { yaml_content }),

  delete: (id: string) => client.delete<{ ok: true }>(`/api/pipelines/${id}`),

  validate: (yaml_content: string) =>
    client.post<ValidationResult>('/api/pipelines/validate', { yaml_content }),

  getMermaid: (id: string) => client.get<{ mermaid: string }>(`/api/pipelines/${id}/mermaid`),

  // 执行管理
  run: (id: string, params: Record<string, unknown>) =>
    client.post<{ ok: true; run_id: string }>(`/api/pipelines/${id}/run`, { params }),

  listRuns: (params?: { pipeline_id?: string; status?: RunStatus; limit?: number }) =>
    client.get<PipelineRun[]>('/api/pipelines/runs', { params }),

  getRun: (runId: string) => client.get<PipelineRun>(`/api/pipelines/runs/${runId}`),

  cancelRun: (runId: string) =>
    client.post<{ ok: true }>(`/api/pipelines/runs/${runId}/cancel`),

  approveRun: (runId: string) =>
    client.post<{ ok: true }>(`/api/pipelines/runs/${runId}/approve`),

  rejectRun: (runId: string) =>
    client.post<{ ok: true }>(`/api/pipelines/runs/${runId}/reject`),

  getRunLogs: (runId: string) => client.get<StepLog[]>(`/api/pipelines/runs/${runId}/logs`),

  // P3-A: Pipeline AI Chat
  sendChatMessage: (runId: string, message: string) =>
    client.post<{ ok: true; message: string }>(`/api/pipelines/runs/${runId}/chat`, { message }),

  getChatEvents: (runId: string, afterSeq = 0, limit = 200) =>
    client.get<PipelineChatEvent[]>(`/api/pipelines/runs/${runId}/chat-events`, {
      params: { after_seq: afterSeq, limit },
    }),
}
