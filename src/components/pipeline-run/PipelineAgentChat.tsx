/**
 * PipelineAgentChat — AI 消息渲染区域（嵌入步骤流中）。
 * 渲染 agent_message / agent_tool_call / agent_tool_result 事件。
 */

import { cn } from '@/lib/utils'
import { MarkdownContent } from '@/pages/agents/MarkdownContent'
import type { ChatMessage } from '@/hooks/usePipelineRunSSE'

interface PipelineAgentChatProps {
  messages: ChatMessage[]
  isStreaming: boolean
}

export function PipelineAgentChat({ messages, isStreaming }: PipelineAgentChatProps) {
  if (messages.length === 0 && !isStreaming) return null

  return (
    <div className="space-y-2">
      {messages.map((msg) => {
        if (msg.event_type === 'agent_tool_call' || msg.event_type === 'chat_tool_call') {
          return (
            <div key={msg.id} className="flex items-center gap-1.5 text-[11px] text-text3">
              <i className="ti ti-tool text-xs" />
              <span className="font-mono">{msg.tool}</span>
              <i className="ti ti-loader animate-spin text-xs" />
            </div>
          )
        }

        if (msg.event_type === 'agent_tool_result' || msg.event_type === 'chat_tool_result') {
          return (
            <div key={msg.id} className="rounded border border-border/50 bg-bg p-2 text-[11px] text-text3">
              <div className="flex items-center gap-1 mb-1">
                <i className="ti ti-check text-green text-xs" />
                <span className="font-mono">{msg.tool}</span>
              </div>
              {msg.content && (
                <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]">
                  {msg.content.length > 500 ? msg.content.slice(0, 500) + '...' : msg.content}
                </pre>
              )}
            </div>
          )
        }

        if (msg.role === 'assistant') {
          return (
            <div key={msg.id} className="text-sm leading-relaxed">
              {!msg.final && isStreaming ? (
                <span className="whitespace-pre-wrap">
                  {msg.content}
                  <span className="inline-block w-1.5 h-4 bg-accent/60 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                </span>
              ) : (
                <MarkdownContent content={msg.content} />
              )}
            </div>
          )
        }

        if (msg.role === 'user') {
          return (
            <div key={msg.id} className="flex justify-end">
              <div
                className={cn(
                  'max-w-[85%] rounded-xl rounded-br-sm px-3 py-2',
                  'bg-accent text-[#0f172a] text-xs',
                )}
              >
                {msg.content}
              </div>
            </div>
          )
        }

        return null
      })}

      {isStreaming && messages.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-text3">
          <i className="ti ti-loader animate-spin" />
          <span>AI 正在分析...</span>
        </div>
      )}
    </div>
  )
}
