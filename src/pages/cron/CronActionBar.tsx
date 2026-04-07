import { cn } from '@/lib/utils'
import type { CronJobSpec } from '@/types/cron-agent'

type CronAction = 'insert' | 'optimize' | 'rewrite' | 'explain'

interface CronActionBarProps {
  spec: CronJobSpec
  onAction: (action: CronAction, contextMessage: string) => void
  disabled?: boolean
}

const ACTIONS: { id: CronAction; icon: string; label: string; variant: string }[] = [
  { id: 'insert', icon: '⏰', label: '插入定时规则', variant: 'bg-accent text-[#0f172a]' },
  { id: 'optimize', icon: '✨', label: '进一步优化', variant: 'bg-purple/12 text-purple border border-purple/25' },
  { id: 'rewrite', icon: '🔄', label: '重写脚本', variant: 'bg-yellow/10 text-yellow border border-yellow/25' },
  { id: 'explain', icon: '📖', label: '解释功能', variant: 'bg-green/10 text-green border border-green/25' },
]

export function CronActionBar({ spec, onAction, disabled }: CronActionBarProps) {
  function buildContext(action: CronAction): string {
    const specJson = JSON.stringify(spec, null, 2)
    switch (action) {
      case 'insert': return '' // handled by parent
      case 'optimize':
        return `请分析以下定时任务脚本，给出 2-4 个优化方向供我选择。请使用以下格式输出选项：

\`\`\`suggestions
["添加错误处理和异常捕获", "优化性能和资源使用", "增加日志和通知功能", "添加安全检查和权限验证"]
\`\`\`

当前脚本规格：
\`\`\`cron-job-spec
${specJson}
\`\`\``
      case 'rewrite':
        return `请重写以下定时任务脚本，使用更好的 Shell 编程实践（包括错误处理、日志记录、参数化配置）：

\`\`\`cron-job-spec
${specJson}
\`\`\``
      case 'explain':
        return `请详细解释以下定时任务脚本的功能，逐行注释关键部分：

\`\`\`cron-job-spec
${specJson}
\`\`\``
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {ACTIONS.map(a => (
        <button
          key={a.id}
          onClick={() => onAction(a.id, buildContext(a.id))}
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md transition-all duration-150',
            'hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed',
            a.variant,
          )}
        >
          <span>{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  )
}
