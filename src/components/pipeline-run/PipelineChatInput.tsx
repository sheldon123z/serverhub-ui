/**
 * PipelineChatInput — Pipeline 执行面板底部输入框。
 */

import { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface PipelineChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  isStreaming?: boolean
}

export function PipelineChatInput({ onSend, disabled, isStreaming }: PipelineChatInputProps) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const msg = text.trim()
    if (!msg || disabled || isStreaming) return
    onSend(msg)
    setText('')
    inputRef.current?.focus()
  }, [text, disabled, isStreaming, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="border-t border-border bg-bg p-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={isStreaming ? 'AI 正在回复...' : '输入消息或提问...'}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border border-border bg-bg2 px-3 py-2',
            'text-sm text-text placeholder:text-text3',
            'focus:border-accent focus:outline-none',
            'max-h-24',
            disabled && 'opacity-50',
          )}
          style={{ minHeight: '38px' }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || isStreaming || !text.trim()}
          className={cn(
            'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            text.trim() && !disabled && !isStreaming
              ? 'bg-accent text-[#0f172a] hover:bg-accent/90'
              : 'bg-bg2 text-text3',
          )}
        >
          <i className="ti ti-send" />
        </button>
      </div>
      <p className="mt-1 text-[10px] text-text3">
        <i className="ti ti-shield-check mr-0.5" />
        只读顾问模式 — 可查询状态和日志，不执行写入操作
      </p>
    </div>
  )
}
