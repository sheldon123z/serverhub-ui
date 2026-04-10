/**
 * MessageBubble — store-aware wrapper around PureMessageBubble.
 *
 * Injects streaming state from useChatStore and handles UI component messages.
 * The pure rendering logic lives in components/chat/PureMessageBubble.tsx.
 */

import React from 'react'
import type { ChatMessage, UIComponentMessage } from '@/types/agent'
import { isUIComponentMessage } from '@/lib/message-utils'
import { PureMessageBubble } from '@/components/chat/PureMessageBubble'
import { UICard } from '@/components/agent/UICard'
import { UIComponentErrorBoundary } from '@/components/agent/UIComponentErrorBoundary'
import { useChatStore } from '@/stores/chatStore'

interface MessageBubbleProps {
  message: ChatMessage
  onDelete?: (id: string) => void
  onResend?: (content: string, id: string) => void
}

export const MessageBubble = React.memo(function MessageBubble({ message, onDelete, onResend }: MessageBubbleProps) {
  const streamingMessageId = useChatStore((s) => s.streamingMessageId)
  const isStreaming = message.role === 'assistant' && message._id === streamingMessageId

  // UI Component messages — keep store-dependent logic here
  if (message.role === 'ui_component' && isUIComponentMessage(message)) {
    const handleUIAction = (actionId: string, payload?: Record<string, unknown>) => {
      fetch('/api/agents/ui/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          component_id: message.data?.id,
          component_type: message.componentType,
          action_id: actionId,
          action_type: 'agent',
          payload: payload ?? {},
          conversation_id: useChatStore.getState().conversationId,
          run_id: useChatStore.getState().currentRunId,
        }),
      }).catch(console.error)
    }

    return (
      <div className="flex justify-start">
        <div className="group max-w-[95%]">
          <UIComponentErrorBoundary componentId={(message.data?.id as string) ?? 'unknown'}>
            <UICard
              component={message.data as UIComponentMessage['data']}
              onAction={handleUIAction}
            />
          </UIComponentErrorBoundary>
        </div>
      </div>
    )
  }

  // Delegate to pure renderer
  return (
    <PureMessageBubble
      message={message}
      isStreaming={isStreaming}
      onDelete={onDelete}
      onResend={onResend}
    />
  )
})
