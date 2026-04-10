import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { DecisionOption } from '@/api/pipelines'
import { DecisionCountdown } from './DecisionCountdown'
import { MarkdownContent } from '@/pages/agents/MarkdownContent'

interface PipelineDecisionCardProps {
  decisionRequestId: string
  prompt: string
  options: DecisionOption[]
  context?: string
  timeout?: number
  onTimeout?: string
  startedAt: number
  onDecide: (optionId: string) => void
}

export function PipelineDecisionCard({
  decisionRequestId: _decisionRequestId,
  prompt,
  options,
  context,
  timeout,
  onTimeout,
  startedAt,
  onDecide,
}: PipelineDecisionCardProps) {
  const [submitting, setSubmitting] = useState<string | null>(null)

  const handleDecide = async (optionId: string) => {
    setSubmitting(optionId)
    try {
      await onDecide(optionId)
    } finally {
      setSubmitting(null)
    }
  }

  const timeoutLabel = onTimeout
    ? options.find((o) => o.id === onTimeout)?.label ?? onTimeout
    : undefined

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-amber-400">
        <i className="ti ti-alert-triangle" />
        需要人工决策
      </div>

      <div className="text-sm text-text mb-2">
        <MarkdownContent content={prompt} />
      </div>

      {context && (
        <div className="mb-3 rounded border border-border/50 bg-bg p-2 text-[11px] text-text3">
          <div className="font-medium mb-1">参考上下文:</div>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono">
            {context.length > 1000 ? context.slice(0, 1000) + '...' : context}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleDecide(opt.id)}
            disabled={submitting !== null}
            className={cn(
              'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
              submitting === opt.id
                ? 'border-accent bg-accent/20 text-accent'
                : 'border-border bg-bg2 text-text hover:border-accent hover:text-accent',
            )}
            title={opt.description}
          >
            {submitting === opt.id ? '...' : opt.label}
          </button>
        ))}
      </div>

      {timeout && timeout > 0 && (
        <DecisionCountdown
          timeoutSeconds={timeout}
          startedAt={startedAt}
          onTimeoutLabel={timeoutLabel}
        />
      )}
    </div>
  )
}
