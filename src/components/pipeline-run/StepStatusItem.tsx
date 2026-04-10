/**
 * StepStatusItem — 单个步骤的状态行。
 * Agent 类型步骤在 running 状态时展开 AI 对话区域。
 */

import { cn } from '@/lib/utils'
import type { StepStatus } from '@/api/pipelines'
import type { PendingDecision } from '@/api/pipelines'
import type { StepState, ChatMessage } from '@/hooks/usePipelineRunSSE'
import { PipelineAgentChat } from './PipelineAgentChat'
import { PipelineDecisionCard } from './PipelineDecisionCard'

const STEP_TYPE_ICON: Record<string, string> = {
  shell: 'ti-terminal-2',
  ssh: 'ti-server',
  agent: 'ti-robot',
  approval: 'ti-user-check',
  decision: 'ti-git-compare',
  condition: 'ti-git-branch',
  parallel: 'ti-arrows-split-2',
  notify: 'ti-bell',
  http: 'ti-world',
  delay: 'ti-clock',
  playbook: 'ti-book',
}

const STATUS_ICON: Record<string, string> = {
  pending: 'ti-circle',
  running: 'ti-loader animate-spin',
  completed: 'ti-circle-check',
  failed: 'ti-circle-x',
  skipped: 'ti-circle-minus',
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-text3',
  running: 'text-accent',
  completed: 'text-green',
  failed: 'text-red',
  skipped: 'text-text3',
}

interface StepStatusItemProps {
  step: {
    id: string
    type: string
    name: string
    status: StepStatus
    duration_ms: number | null
    error: string | null
  }
  sseState?: StepState
  agentMessages?: ChatMessage[]
  isActiveAgent?: boolean
  pendingDecision?: PendingDecision | null
  onSubmitDecision?: (stepId: string, decisionRequestId: string, optionId: string) => void
  onApprove?: () => void
  onReject?: () => void
  approvePending?: boolean
  rejectPending?: boolean
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function StepStatusItem({
  step,
  sseState,
  agentMessages,
  isActiveAgent,
  pendingDecision,
  onSubmitDecision,
  onApprove,
  onReject,
  approvePending,
  rejectPending,
}: StepStatusItemProps) {
  const status = sseState?.status ?? step.status
  const durationMs = sseState?.duration_ms ?? step.duration_ms
  const error = sseState?.error ?? step.error
  const icon = STEP_TYPE_ICON[step.type] ?? 'ti-point'
  const isApprovalWaiting = step.type === 'approval' && status === 'running'
  const isDecisionWaiting = step.type === 'decision' && pendingDecision?.stepId === step.id
  const showAgentChat = step.type === 'agent' && (isActiveAgent || (agentMessages && agentMessages.length > 0))

  return (
    <div
      className={cn(
        'rounded-lg border p-2.5 transition-colors',
        status === 'running'
          ? 'border-accent/40 bg-accent-dim/20'
          : status === 'failed'
            ? 'border-red/30 bg-red/5'
            : 'border-border bg-bg2',
      )}
    >
      <div className="flex items-center gap-2">
        <i className={cn('ti text-sm', icon, 'text-text3')} />
        <span className="flex-1 truncate text-xs font-medium text-text">
          {step.name}
        </span>
        <i className={cn('ti text-sm', STATUS_ICON[status], STATUS_COLOR[status])} />
        {durationMs != null && (
          <span className="text-[10px] tabular-nums text-text3">
            {formatDuration(durationMs)}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-[11px] text-red">{error}</p>
      )}

      {showAgentChat && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <PipelineAgentChat
            messages={agentMessages ?? []}
            isStreaming={isActiveAgent ?? false}
          />
        </div>
      )}

      {isApprovalWaiting && onApprove && onReject && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={approvePending}
            className="rounded-md bg-green px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green/90"
          >
            {approvePending ? '...' : '通过'}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={rejectPending}
            className="rounded-md bg-red px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red/90"
          >
            {rejectPending ? '...' : '拒绝'}
          </button>
        </div>
      )}

      {/* Decision card */}
      {isDecisionWaiting && pendingDecision && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <PipelineDecisionCard
            decisionRequestId={pendingDecision.decisionRequestId}
            prompt={pendingDecision.prompt}
            options={pendingDecision.options}
            context={pendingDecision.context}
            timeout={pendingDecision.timeout}
            onTimeout={pendingDecision.onTimeout}
            startedAt={pendingDecision.requestedAt}
            onDecide={(optionId) =>
              onSubmitDecision?.(step.id, pendingDecision.decisionRequestId, optionId)
            }
          />
        </div>
      )}
    </div>
  )
}
