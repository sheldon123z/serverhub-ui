import { memo, useCallback } from 'react'
import { STEP_ACCENT, STEP_ICON, STEP_LABEL } from './nodes'

const STEP_TYPES = [
  'shell', 'ssh', 'agent', 'approval', 'decision', 'condition',
  'parallel', 'notify', 'http', 'delay', 'playbook',
] as const

const STEP_DESC: Record<string, string> = {
  shell: '执行本地命令',
  ssh: 'SSH 远程执行',
  agent: 'AI 智能体执行',
  approval: '人工审批门控',
  decision: '多选项决策',
  condition: '条件分支',
  parallel: '并行执行',
  notify: '发送通知',
  http: 'HTTP 请求',
  delay: '延时等待',
  playbook: '调用剧本',
}

export const StepPalette = memo(function StepPalette() {
  const onDragStart = useCallback((e: React.DragEvent, stepType: string) => {
    e.dataTransfer.setData('application/pipeline-step', stepType)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  return (
    <div className="flex flex-col items-center gap-1 py-2 w-12 bg-white/70 dark:bg-black/50 backdrop-blur-sm border-r border-border shrink-0">
      {STEP_TYPES.map((type) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => onDragStart(e, type)}
          className="group relative flex items-center justify-center w-9 h-9 rounded-lg cursor-grab active:cursor-grabbing
            hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title={`${STEP_LABEL[type]} — ${STEP_DESC[type]}`}
        >
          <i
            className={`ti ${STEP_ICON[type]} text-lg`}
            style={{ color: STEP_ACCENT[type] }}
          />
          {/* Tooltip */}
          <div className="pointer-events-none absolute left-full ml-2 hidden group-hover:flex items-center z-50">
            <div className="whitespace-nowrap rounded-lg bg-[#1d1d1f] px-2.5 py-1.5 text-xs text-white shadow-lg">
              <div className="font-medium">{STEP_LABEL[type]}</div>
              <div className="text-white/60 text-[10px]">{STEP_DESC[type]}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
})
