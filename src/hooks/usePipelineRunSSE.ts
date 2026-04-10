/**
 * usePipelineRunSSE — Pipeline 运行 SSE 事件管理 + hydration
 *
 * 处理统一 SSE 通道中的所有事件类型：
 * - 步骤状态事件 (step_start, step_complete, step_failed)
 * - Agent 执行事件 (agent_start, agent_message, agent_tool_call, agent_tool_result, agent_complete)
 * - 侧聊事件 (chat_message, chat_tool_call, chat_tool_result)
 * - 流水线事件 (pipeline_complete, approval_required)
 *
 * Hydration 策略：先拉历史 → 再接 SSE → 用 seq 去重
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PipelineChatEvent, PipelineSSEEvent, StepStatus } from '@/api/pipelines'
import { pipelinesApi } from '@/api/pipelines'

/* ── Types ── */

export interface StepState {
  step_id: string
  step_name?: string
  step_type?: string
  status: StepStatus
  duration_ms?: number
  error?: string
  output_preview?: string
  assignee?: string
}

export interface ChatMessage {
  id: string
  message_id: string
  event_type: string
  role: string
  content: string
  final: boolean
  step_id?: string
  tool?: string
  args?: Record<string, unknown>
  tool_call_id?: string
  seq: number
}

interface PipelineRunSSEState {
  /** 步骤状态 Map (step_id → StepState) */
  stepStates: Map<string, StepState>
  /** 聊天消息列表（agent + chat 合并，按 seq 排序） */
  chatMessages: ChatMessage[]
  /** 当前活跃的 AI 步骤 ID（agent_start 后、agent_complete 前） */
  activeAgentStepId: string | null
  /** SSE 是否已连接 */
  connected: boolean
  /** Pipeline 是否已结束 */
  completed: boolean
  /** 侧聊 AI 是否正在响应 */
  isChatStreaming: boolean
}

/* ── Hook ── */

export function usePipelineRunSSE(runId: string | null) {
  const [state, setState] = useState<PipelineRunSSEState>({
    stepStates: new Map(),
    chatMessages: [],
    activeAgentStepId: null,
    connected: false,
    completed: false,
    isChatStreaming: false,
  })

  const lastSeqRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  // 分发单个 SSE 事件到状态
  const dispatchEvent = useCallback((evt: PipelineSSEEvent) => {
    // seq 去重
    if (evt.seq != null && evt.seq <= lastSeqRef.current) return
    if (evt.seq != null) lastSeqRef.current = evt.seq

    setState((prev) => {
      const next = { ...prev }
      const type = evt.type

      // ── 步骤状态事件 ──
      if (type === 'step_start' || type === 'step_complete' || type === 'step_failed' || type === 'step_retry' || type === 'approval_required') {
        if (evt.step_id) {
          const steps = new Map(prev.stepStates)
          const existing = steps.get(evt.step_id) ?? { step_id: evt.step_id, status: 'pending' as StepStatus }
          steps.set(evt.step_id, {
            ...existing,
            ...evt,
            status: (evt.status as StepStatus) ??
              (type === 'step_start' ? 'running' : type === 'step_complete' ? 'completed' : type === 'step_failed' ? 'failed' : existing.status),
          })
          next.stepStates = steps
        }
        return next
      }

      // ── Agent 执行事件 ──
      if (type === 'agent_start') {
        next.activeAgentStepId = evt.step_id ?? null
        return next
      }
      if (type === 'agent_complete') {
        next.activeAgentStepId = null
        return next
      }

      // ── 消息事件（agent + chat 统一处理）──
      if (type === 'agent_message' || type === 'chat_message' ||
          type === 'agent_tool_call' || type === 'chat_tool_call' ||
          type === 'agent_tool_result' || type === 'chat_tool_result') {
        const messages = [...prev.chatMessages]
        const msgId = evt.message_id ?? evt.tool_call_id ?? evt.event_id

        // 对于增量消息（final=false），更新已有消息而非追加
        if ((type === 'agent_message' || type === 'chat_message') && !evt.final) {
          const existingIdx = messages.findIndex((m) => m.message_id === evt.message_id && m.role === (evt.role ?? 'assistant'))
          if (existingIdx >= 0) {
            messages[existingIdx] = { ...messages[existingIdx], content: evt.content ?? '', seq: evt.seq }
            next.chatMessages = messages
            if (type === 'chat_message') next.isChatStreaming = true
            return next
          }
        }

        // 追加新消息
        messages.push({
          id: evt.event_id,
          message_id: evt.message_id ?? msgId,
          event_type: type,
          role: evt.role ?? (type.includes('tool_call') ? 'tool_call' : type.includes('tool_result') ? 'tool_result' : 'assistant'),
          content: evt.content ?? '',
          final: evt.final ?? true,
          step_id: evt.step_id,
          tool: evt.tool,
          args: evt.args,
          tool_call_id: evt.tool_call_id,
          seq: evt.seq,
        })
        next.chatMessages = messages

        // streaming 状态
        if (type === 'chat_message') {
          next.isChatStreaming = !evt.final
        }
        return next
      }

      // ── Pipeline 完成 ──
      if (type === 'pipeline_complete') {
        next.completed = true
        next.connected = false
        return next
      }

      return next
    })
  }, [])

  // 从历史事件恢复状态
  const hydrateFromHistory = useCallback(async (rid: string) => {
    try {
      const res = await pipelinesApi.getChatEvents(rid, 0, 500)
      const events = res.data
      if (!events?.length) return

      for (const evt of events) {
        const parsed: PipelineSSEEvent = {
          event_id: evt.event_id,
          seq: evt.seq,
          timestamp: 0,
          type: evt.event_type as PipelineSSEEvent['type'],
          step_id: evt.step_id ?? undefined,
          message_id: evt.message_id ?? undefined,
          tool_call_id: evt.tool_call_id ?? undefined,
          role: evt.role ?? undefined,
          content: evt.content ?? undefined,
          ...(evt.metadata_json ? JSON.parse(evt.metadata_json) : {}),
        }
        dispatchEvent(parsed)
      }
    } catch {
      // hydration 失败不影响实时流
    }
  }, [dispatchEvent])

  // SSE 连接
  useEffect(() => {
    if (!runId) {
      setState({
        stepStates: new Map(),
        chatMessages: [],
        activeAgentStepId: null,
        connected: false,
        completed: false,
        isChatStreaming: false,
      })
      lastSeqRef.current = 0
      return
    }

    const controller = new AbortController()
    controllerRef.current = controller

    const run = async () => {
      // 1. Hydrate from history
      await hydrateFromHistory(runId)

      // 2. Connect SSE
      try {
        const response = await fetch(`/api/pipelines/runs/${runId}/stream`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok || !response.body) return

        setState((s) => ({ ...s, connected: true }))
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) {
              currentEvent = ''
              continue
            }
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim()
              continue
            }
            if (!trimmed.startsWith('data:')) continue

            const dataStr = trimmed.slice(5).trim()
            if (!dataStr) continue
            try {
              const data = JSON.parse(dataStr) as PipelineSSEEvent
              // 用 currentEvent 覆盖 type（SSE event 字段优先）
              if (currentEvent) data.type = currentEvent as PipelineSSEEvent['type']
              dispatchEvent(data)
            } catch {
              // ignore invalid JSON
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      } finally {
        setState((s) => ({ ...s, connected: false }))
      }
    }

    run()

    return () => {
      controller.abort()
      controllerRef.current = null
    }
  }, [runId, hydrateFromHistory, dispatchEvent])

  // 发送聊天消息
  const sendMessage = useCallback(
    async (message: string) => {
      if (!runId || !message.trim()) return
      setState((s) => ({ ...s, isChatStreaming: true }))
      try {
        await pipelinesApi.sendChatMessage(runId, message.trim())
      } catch {
        setState((s) => ({ ...s, isChatStreaming: false }))
      }
    },
    [runId],
  )

  return {
    ...state,
    sendMessage,
  }
}
