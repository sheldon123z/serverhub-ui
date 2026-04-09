import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

interface ConditionNodeData {
  name: string
  type: string
  expression?: string
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

export const ConditionNode = memo(function ConditionNode({ data, selected }: NodeProps) {
  const d = data as ConditionNodeData
  const status = d.runStatus
  const isPendingOrSkipped = status === 'pending' || status === 'skipped'
  const badge = status ? STATUS_BADGE[status] : undefined
  const ring = status ? STATUS_RING[status] ?? '' : ''

  return (
    <div
      className={`relative flex items-center justify-center ${isPendingOrSkipped ? 'opacity-50' : ''}`}
      style={{ width: 142, height: 142 }}
    >
      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-300 dark:!bg-gray-600 !border-2 !border-white dark:!border-[#1a1a2e]"
      />

      {/* Diamond shape */}
      <div
        className={`
          w-[100px] h-[100px] rotate-45
          bg-white dark:bg-[#272729]
          rounded-lg
          transition-all duration-300
          ${selected ? 'shadow-[0_0_0_2px_#0071e3] scale-[1.02]' : ring}
        `}
        style={{
          boxShadow: ring ? undefined : '0 2px 12px rgba(0,0,0,0.08)',
        }}
      >
        {/* Inner content (counter-rotate to keep text upright) */}
        <div className="-rotate-45 flex flex-col items-center justify-center w-full h-full p-1">
          <i className="ti ti-git-branch text-base text-[#3b82f6] mb-0.5" />
          <div className="text-[11px] font-semibold text-[#1d1d1f] dark:text-[#e2e8f0] text-center leading-tight truncate max-w-[80px]">
            {d.name}
          </div>
        </div>
      </div>

      {/* Status badge */}
      {badge && (
        <div className={`absolute top-0 right-0 w-4 h-4 rounded-full ${badge.bg} flex items-center justify-center z-10`}>
          <i className={`ti ${badge.icon} text-white text-[10px]`} />
        </div>
      )}

      {/* Source handle: True (right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="handle-true"
        className="!w-2 !h-2 !bg-[#22c55e] !border-2 !border-white dark:!border-[#1a1a2e]"
      />
      <span className="absolute right-[-20px] top-1/2 -translate-y-1/2 text-[10px] font-medium text-[#22c55e]">
        是
      </span>

      {/* Source handle: False (left) */}
      <Handle
        type="source"
        position={Position.Left}
        id="handle-false"
        className="!w-2 !h-2 !bg-[#ef4444] !border-2 !border-white dark:!border-[#1a1a2e]"
      />
      <span className="absolute left-[-20px] top-1/2 -translate-y-1/2 text-[10px] font-medium text-[#ef4444]">
        否
      </span>
    </div>
  )
})
