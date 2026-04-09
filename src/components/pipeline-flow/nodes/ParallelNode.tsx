import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

interface ParallelNodeData {
  name: string
  type: string
  branchCount?: number
  runStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  [key: string]: unknown
}

const STATUS_RING: Record<string, string> = {
  running: 'shadow-[0_0_0_2px_#0071e3,0_0_12px_rgba(0,122,227,0.4)] animate-pulse',
  completed: 'shadow-[0_0_0_2px_#22c55e]',
  failed: 'shadow-[0_0_0_2px_#ef4444]',
}

const STATUS_BADGE: Record<string, { bg: string; icon: string }> = {
  running: { bg: 'bg-[#0071e3]', icon: 'ti-loader animate-spin' },
  completed: { bg: 'bg-[#22c55e]', icon: 'ti-check' },
  failed: { bg: 'bg-[#ef4444]', icon: 'ti-x' },
}

export const ParallelNode = memo(function ParallelNode({ data, selected }: NodeProps) {
  const d = data as ParallelNodeData
  const status = d.runStatus
  const isPendingOrSkipped = status === 'pending' || status === 'skipped'
  const badge = status ? STATUS_BADGE[status] : undefined
  const ring = status ? STATUS_RING[status] ?? '' : ''
  const branchCount = d.branchCount ?? 2

  return (
    <div
      className={`
        relative w-[180px] rounded-lg bg-white dark:bg-[#272729]
        transition-all duration-300
        ${selected ? 'shadow-[0_0_0_2px_#0071e3] scale-[1.02]' : ring}
        ${isPendingOrSkipped && !selected ? 'opacity-50' : ''}
      `}
      style={{
        boxShadow: ring
          ? undefined
          : '0 2px 12px rgba(0,0,0,0.08), inset 0 0 0 2px rgba(16,185,129,0.2)',
      }}
    >
      {/* Accent left strip */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-[#10b981]" />

      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-300 dark:!bg-gray-600 !border-2 !border-white dark:!border-[#272729]"
      />

      {/* Content */}
      <div className="flex items-center gap-2.5 py-2.5 pl-4 pr-3">
        <i className="ti ti-arrows-split text-base text-[#10b981]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[#1d1d1f] dark:text-[#e2e8f0] leading-tight">
            {d.name}
          </div>
          <div className="text-[11px] text-black/40 dark:text-white/40 leading-tight mt-0.5">
            并行 · {branchCount} 分支
          </div>
        </div>
      </div>

      {/* Status badge */}
      {badge && (
        <div className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full ${badge.bg} flex items-center justify-center`}>
          <i className={`ti ${badge.icon} text-white text-[10px]`} />
        </div>
      )}

      {/* Source handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-[#10b981] !border-2 !border-white dark:!border-[#272729]"
      />
    </div>
  )
})
