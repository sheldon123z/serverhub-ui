/**
 * PipelineDecisionCard — P3-B 决策卡片占位组件。
 */

interface PipelineDecisionCardProps {
  prompt: string
  options: string[]
  onDecide?: (option: string) => void
}

export function PipelineDecisionCard({ prompt, options }: PipelineDecisionCardProps) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-amber-400">
        <i className="ti ti-alert-triangle" />
        需要人工决策
      </div>
      <p className="text-sm text-text mb-3">{prompt}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled
            className="rounded-md border border-border bg-bg2 px-3 py-1.5 text-xs text-text3 opacity-60"
            title="将在 P3-B 中实现"
          >
            {opt}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-text3">决策功能将在 P3-B 中实现</p>
    </div>
  )
}
