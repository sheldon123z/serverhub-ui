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
import type { PipelineChatEvent, PipelineSSEEvent, PendingDecision, StepStatus } from '@/api/pipelines'
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
  /** 当前待决策请求（decision_request 后、decision_resolved 前） */
  pendingDecision: PendingDecision | null
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
    pendingDecision: null,
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

        // 对于文本消息，按 message_id upsert（不论 final 状态）
        if (type === 'agent_message' || type === 'chat_message') {
          const existingIdx = messages.findIndex(
            (m) => m.message_id === evt.message_id && m.role === (evt.role ?? 'assistant'),
          )
          if (existingIdx >= 0) {
            messages[existingIdx] = {
              ...messages[existingIdx],
              content: evt.content ?? '',
              final: evt.final ?? true,
              seq: evt.seq,
            }
          } else {
            messages.push({
              id: evt.event_id,
              message_id: evt.message_id ?? msgId,
              event_type: type,
              role: evt.role ?? 'assistant',
              content: evt.content ?? '',
              final: evt.final ?? true,
              step_id: evt.step_id,
              seq: evt.seq,
            })
          }
          next.chatMessages = messages
          if (type === 'chat_message') {
            next.isChatStreaming = !evt.final
          }
          return next
        }

        // 工具调用/结果：直接追加
        messages.push({
          id: evt.event_id,
          message_id: evt.message_id ?? msgId,
          event_type: type,
          role: type.includes('tool_call') ? 'tool_call' : 'tool_result',
          content: evt.content ?? '',
          final: evt.final ?? true,
          step_id: evt.step_id,
          tool: evt.tool,
          args: evt.args,
          tool_call_id: evt.tool_call_id,
          seq: evt.seq,
        })
        next.chatMessages = messages
        return next
      }

      // ── Pipeline 完成 ──
      if (type === 'pipeline_complete') {
        next.completed = true
        next.connected = false
        return next
      }

      // ── 决策事件 ──
      if (type === 'decision_request') {
        next.pendingDecision = {
          decisionRequestId: evt.decision_request_id ?? '',
          stepId: evt.step_id ?? '',
          prompt: evt.content ?? '',
          options: evt.options ?? [],
          context: evt.context,
          timeout: evt.timeout as number | undefined,
          onTimeout: evt.on_timeout,
          source: (evt.source as 'step' | 'ai') ?? 'step',
          requestedAt: evt.timestamp,
        }
        return next
      }
      if (type === 'decision_resolved') {
        next.pendingDecision = null
        return next
      }

      return next
    })
  }, [])

  // 从历史事件恢复状态
  const hydrateFromHistory = useCallback(async (rid: string) => {
    try {
      const res = await pipelinesApi.getChatEvents(rid, lastSeqRef.current, 500)
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
    // 每次 runId 变化都重置状态（防止旧 run 数据污染）
    setState({
      stepStates: new Map(),
      chatMessages: [],
      activeAgentStepId: null,
      connected: false,
      completed: false,
      isChatStreaming: false,
      pendingDecision: null,
    })
    lastSeqRef.current = 0

    if (!runId) {
      return
    }

    const controller = new AbortController()
    controllerRef.current = controller

    const run = async () => {
      // 1. Hydrate from history
      await hydrateFromHistory(runId)

      // 2. Connect SSE with retry
      let retryCount = 0
      const MAX_RETRIES = 10
      const BASE_DELAY = 1000

      while (!controller.signal.aborted && retryCount < MAX_RETRIES) {
        try {
          const response = await fetch(`/api/pipelines/runs/${runId}/stream`, {
            credentials: 'include',
            signal: controller.signal,
          })
          if (!response.ok || !response.body) {
            throw new Error(`SSE response ${response.status}`)
          }

          setState((s) => ({ ...s, connected: true }))
          retryCount = 0 // 成功连接后重置计数
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let currentEvent = ''
          let dataLines: string[] = []

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              const trimmed = line.trim()

              // 空行 = 事件分隔符，处理累积的 data
              if (!trimmed) {
                if (dataLines.length > 0) {
                  const fullData = dataLines.join('\n')
                  try {
                    const data = JSON.parse(fullData) as PipelineSSEEvent
                    if (currentEvent) data.type = currentEvent as PipelineSSEEvent['type']
                    dispatchEvent(data)
                  } catch {
                    // ignore invalid JSON
                  }
                }
                currentEvent = ''
                dataLines = []
                continue
              }

              if (trimmed.startsWith('event:')) {
                currentEvent = trimmed.slice(6).trim()
                continue
              }
              if (trimmed.startsWith('data:')) {
                dataLines.push(trimmed.slice(5).trim())
              }
            }
          }

          // Stream ended normally (pipeline complete) — don't retry
          break
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return

          retryCount++
          setState((s) => ({ ...s, connected: false }))

          if (retryCount >= MAX_RETRIES) break

          // Exponential backoff with jitter
          const delay = Math.min(BASE_DELAY * 2 ** (retryCount - 1), 30000)
          const jitter = delay * 0.2 * Math.random()
          await new Promise((r) => setTimeout(r, delay + jitter))

          // Rehydrate to fill gap
          await hydrateFromHistory(runId)
        }
      }

      setState((s) => ({ ...s, connected: false }))
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

  // 提交决策选择
  const submitDecision = useCallback(
    async (stepId: string, decisionRequestId: string, optionId: string) => {
      if (!runId) return
      await pipelinesApi.submitDecision(runId, stepId, decisionRequestId, optionId)
    },
    [runId],
  )

  return {
    ...state,
    sendMessage,
    submitDecision,
  }
}
