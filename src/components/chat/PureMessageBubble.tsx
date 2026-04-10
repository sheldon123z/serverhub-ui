/**
 * PureMessageBubble — stateless message renderer (no store dependencies).
 *
 * Extracted from pages/agents/MessageBubble.tsx.
 * The original MessageBubble is now a thin wrapper that injects store state.
 */

import React, { useCallback } from 'react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types/agent'
import { useStreamingText } from '@/hooks/useStreamingText'
import { MarkdownContent } from '@/pages/agents/MarkdownContent'

interface PureMessageBubbleProps {
  message: ChatMessage
  isStreaming?: boolean
  onDelete?: (id: string) => void
  onResend?: (content: string, id: string) => void
}

function ActionBar({
  onCopy,
  onDelete,
  onResend,
}: {
  onCopy: () => void
  onDelete?: () => void
  onResend?: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 mt-1',
        'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        'text-xs',
      )}
    >
      <button onClick={onCopy} className="hover:text-accent px-1.5 py-0.5 text-text3" title="复制">
        复制
      </button>
      {onResend && (
        <button onClick={onResend} className="hover:text-accent px-1.5 py-0.5 text-text3" title="重发">
          重发
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} className="hover:text-red px-1.5 py-0.5 text-text3" title="删除">
          删除
        </button>
      )}
    </div>
  )
}

export const PureMessageBubble = React.memo(function PureMessageBubble({
  message,
  isStreaming = false,
  onDelete,
  onResend,
}: PureMessageBubbleProps) {
  const { role, content, _id } = message

  const { displayedContent, isAnimating } = useStreamingText(content, {
    enabled: isStreaming,
    segmentDelay: 12,
  })

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => toast.success('已复制')).catch(() => toast.error('复制失败'))
  }, [content])

  const handleDelete = onDelete ? () => onDelete(_id) : undefined
  const handleResend = onResend ? () => onResend(content, _id) : undefined

  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="group max-w-[85%]">
          <div
            className={cn(
              'rounded-xl rounded-br-sm px-4 py-2.5',
              'bg-accent text-[#0f172a]',
              'text-sm leading-relaxed whitespace-pre-wrap break-words',
            )}
          >
            {content}
          </div>
          <div className="flex justify-end">
            <ActionBar onCopy={handleCopy} onDelete={handleDelete} onResend={handleResend} />
          </div>
        </div>
      </div>
    )
  }

  if (role === 'assistant') {
    return (
      <div className="flex justify-start">
        <div className="group max-w-[85%]">
          <div
            className={cn(
              'rounded-xl rounded-bl-sm px-4 py-2.5',
              'glass',
              'text-sm leading-relaxed',
            )}
          >
            {isStreaming ? (
              <>
                <span className="whitespace-pre-wrap">{displayedContent}</span>
                {isAnimating && (
                  <span className="inline-block w-1.5 h-4 bg-accent/60 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                )}
              </>
            ) : (
              <MarkdownContent content={content} />
            )}
          </div>
          <ActionBar onCopy={handleCopy} onDelete={handleDelete} onResend={handleResend} />
        </div>
      </div>
    )
  }

  // Fallback
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] glass rounded-lg px-3 py-2 text-sm text-text2">
        {content}
      </div>
    </div>
  )
})
