import { cn } from '@/lib/utils'
import { FileCode2 } from 'lucide-react'

interface ScriptLinkBlockProps {
  filePath: string
  firstLine: string
  lineCount: number
  timestamp: number
  isActive: boolean
  onClick: () => void
}

export function ScriptLinkBlock({ filePath, firstLine, lineCount, timestamp, isActive, onClick }: ScriptLinkBlockProps) {
  const fileName = filePath.split('/').pop() ?? filePath
  const timeStr = new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left glass rounded-lg p-2.5 mt-1.5 transition-all duration-150 group',
        isActive
          ? 'border-accent/40 ring-1 ring-accent/20'
          : 'hover:border-accent/20',
      )}
    >
      <div className="flex items-center gap-2">
        <FileCode2 size={14} className={cn('shrink-0', isActive ? 'text-accent' : 'text-text3 group-hover:text-accent')} />
        <span className={cn('text-[12px] font-semibold font-mono truncate', isActive ? 'text-accent' : 'text-text')}>{fileName}</span>
      </div>
      <div className="mt-1 text-[10px] font-mono text-text3 truncate pl-[22px]">{firstLine || '#!/bin/bash'}</div>
      <div className="flex items-center gap-2 mt-1 pl-[22px] text-[9px] text-text3/60">
        <span>{timeStr}</span>
        <span>·</span>
        <span>{lineCount} 行</span>
      </div>
    </button>
  )
}
