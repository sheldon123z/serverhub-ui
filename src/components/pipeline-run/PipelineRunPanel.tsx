/**
 * PipelineRunPanel — Pipeline 混合执行面板主容器。
 *
 * 合并程序化步骤状态 + AI 节点对话 + 操作员侧聊。
 * 替代 PipelinesPage 中原有的 RunPanel 组件。
 */

import { useMemo, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { PipelineRun, StepDefinition, StepLog, StepStatus } from '@/api/pipelines'
import { usePipelineRunSSE } from '@/hooks/usePipelineRunSSE'
import { StepStatusItem } from './StepStatusItem'
import { PipelineAgentChat } from './PipelineAgentChat'
import { PipelineChatInput } from './PipelineChatInput'

function parseJsonSafe<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return `${min}m${sec}s`
}

const RUN_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-text3/20 text-text3',
  running: 'bg-accent/20 text-accent',
  paused: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-green/20 text-green',
  failed: 'bg-red/20 text-red',
  cancelled: 'bg-text3/20 text-text3',
}

interface PipelineRunPanelProps {
  runId: string
  run: PipelineRun
  stepsJson: string
  stepLogs: StepLog[]
  onCancel: () => void
  onApprove: () => void
  onReject: () => void
  cancelPending: boolean
  approvePending: boolean
  rejectPending: boolean
}

export function PipelineRunPanel({
  runId,
  run,
  stepsJson,
  stepLogs,
  onCancel,
  onApprove,
  onReject,
  cancelPending,
  approvePending,
  rejectPending,
}: PipelineRunPanelProps) {
  const {
    stepStates,
    chatMessages,
    activeAgentStepId,
    connected,
    isChatStreaming,
    pendingDecision,
    sendMessage,
    submitDecision,
  } = usePipelineRunSSE(runId)

  const scrollRef = useRef<HTMLDivElement>(null)
  const isActive = run.status === 'running' || run.status === 'paused'

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages.length, stepStates.size])

  const mergedSteps = useMemo(() => {
    const defs = parseJsonSafe<StepDefinition[]>(stepsJson, [])
    return defs.map((step) => {
      const log = stepLogs.find((l) => l.step_id === step.id)
      const sse = stepStates.get(step.id)
      const status: StepStatus =
        (sse?.status as StepStatus) ?? (log?.status as StepStatus) ?? 'pending'
      return {
        id: step.id,
        type: step.type,
        name: step.name,
        status,
        duration_ms: sse?.duration_ms ?? log?.duration_ms ?? null,
        error: sse?.error ?? log?.error ?? null,
      }
    })
  }, [stepsJson, stepLogs, stepStates])

  const agentMessagesByStep = useMemo(() => {
    const map = new Map<string, typeof chatMessages>()
    for (const msg of chatMessages) {
      if (msg.step_id && (msg.event_type.startsWith('agent_') || msg.event_type.startsWith('chat_'))) {
        const arr = map.get(msg.step_id) ?? []
        arr.push(msg)
        map.set(msg.step_id, arr)
      }
    }
    return map
  }, [chatMessages])

  const sidebarChatMessages = useMemo(
    () => chatMessages.filter((m) => !m.step_id && m.event_type.startsWith('chat_')),
    [chatMessages],
  )

  const elapsed = useMemo(() => {
    if (!run.started_at) return null
    const start = new Date(run.started_at).getTime()
    const end = run.completed_at ? new Date(run.completed_at).getTime() : Date.now()
    return end - start
  }, [run.started_at, run.completed_at])

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium',
                RUN_STATUS_STYLES[run.status],
              )}
            >
              {run.status}
            </span>
            {connected && (
              <span className="flex items-center gap-1 text-xs text-green">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
                实时
              </span>
            )}
          </div>
          {isActive && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelPending}
              className="rounded-lg px-2.5 py-1 text-xs text-red transition-colors hover:bg-red/10"
            >
              {cancelPending ? '取消中...' : '取消运行'}
            </button>
          )}
        </div>

        <div className="text-xs text-text3">
          <span>触发: {run.trigger_type}</span>
          <span className="mx-2">|</span>
          <span>操作人: {run.started_by}</span>
          {elapsed != null && (
            <>
              <span className="mx-2">|</span>
              <span>耗时: {formatDuration(elapsed)}</span>
            </>
          )}
        </div>

        {run.error && (
          <div className="rounded-lg border border-red/30 bg-red/10 p-2 text-xs text-red">
            <i className="ti ti-alert-circle mr-1" />
            {run.error}
          </div>
        )}

        {run.summary && (
          <div className="rounded-lg border border-border bg-bg2 p-2 text-xs text-text2">
            <i className="ti ti-file-text mr-1" />
            {run.summary}
          </div>
        )}
      </div>

      {/* ── Step list + AI chat (scrollable) ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text3">步骤进度</h4>
          {mergedSteps.map((step) => (
            <StepStatusItem
              key={step.id}
              step={step}
              sseState={stepStates.get(step.id)}
              agentMessages={agentMessagesByStep.get(step.id)}
              isActiveAgent={step.id === activeAgentStepId}
              pendingDecision={pendingDecision}
              onSubmitDecision={submitDecision}
              onApprove={onApprove}
              onReject={onReject}
              approvePending={approvePending}
              rejectPending={rejectPending}
            />
          ))}
          {mergedSteps.length === 0 && (
            <p className="py-4 text-center text-xs text-text3">无步骤信息</p>
          )}
        </div>

        {sidebarChatMessages.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text3">对话</h4>
            <PipelineAgentChat
              messages={sidebarChatMessages}
              isStreaming={isChatStreaming}
            />
          </div>
        )}
      </div>

      {/* ── Chat input ── */}
      <PipelineChatInput
        onSend={sendMessage}
        isStreaming={isChatStreaming}
      />
    </div>
  )
}
