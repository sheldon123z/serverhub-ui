import { useState, useCallback, useRef } from 'react'
import { type ScopedMessage, type CronJobSpec, parseCronJobSpec, parseSuggestions } from '@/types/cron-agent'

// ─── Utilities ───────────────────────────────────────────────────────────────

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function extractContent(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((block: unknown) => {
        if (typeof block === 'string') return block
        if (block && typeof block === 'object' && 'type' in block && 'text' in block) {
          const b = block as { type: string; text: string }
          if (b.type === 'text' && typeof b.text === 'string') return b.text
        }
        return ''
      })
      .join('')
  }
  if (raw && typeof raw === 'object') return JSON.stringify(raw)
  return String(raw ?? '')
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseScopedSSEChatOptions {
  pageContext: string
  onSpecDetected?: (spec: CronJobSpec, messageId: string) => void
  onSuggestionsDetected?: (suggestions: string[], messageId: string) => void
}

interface UseScopedSSEChatReturn {
  messages: ScopedMessage[]
  isStreaming: boolean
  conversationId: string
  currentRunId: string | null
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
  cancelStreaming: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScopedSSEChat(options: UseScopedSSEChatOptions): UseScopedSSEChatReturn {
  const [messages, setMessages] = useState<ScopedMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)

  // Stable refs — do NOT trigger re-renders
  const conversationId = useRef<string>(generateUUID())
  const abortRef = useRef<AbortController | null>(null)
  const streamingMsgId = useRef<string>('')
  const accContent = useRef<string>('')

  // ── sendMessage ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      // Abort any in-flight request
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      // Build message IDs up front
      const userMsgId = `u_${Date.now()}`
      const assistantId = `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      streamingMsgId.current = assistantId
      accContent.current = ''

      const userMsg: ScopedMessage = { _id: userMsgId, role: 'user', content: text }
      const assistantMsg: ScopedMessage = {
        _id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)

      // ── Event handler (defined inside sendMessage so it closes over refs) ──
      function handleEvent(event: string, data: Record<string, unknown>) {
        switch (event) {
          case 'run.started':
            if (data.run_id) setCurrentRunId(data.run_id as string)
            break

          case 'message.final':
          case 'message': {
            const content = extractContent(data.content)
            if (content) {
              accContent.current = content
              setMessages((prev) =>
                prev.map((m) =>
                  m._id === streamingMsgId.current ? { ...m, content } : m,
                ),
              )
            }
            break
          }

          case 'tool.call':
          case 'tool_call': {
            const toolName =
              (data.tool as string) ?? (data.name as string) ?? 'unknown'
            const toolArgs =
              (data.input as Record<string, unknown>) ??
              (data.args as Record<string, unknown>) ??
              {}
            setMessages((prev) => [
              ...prev,
              {
                _id: `tc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                role: 'tool_call',
                content: '',
                tool: toolName,
                args: toolArgs,
              },
            ])
            break
          }

          case 'tool.result':
          case 'tool_result':
            // Silently consume — tool results don't need to be shown in cron panel
            break

          case 'run.completed':
            if (data.conversation_id)
              conversationId.current = data.conversation_id as string
            break

          case 'run.error':
          case 'error': {
            const errMsg = (data.error as string) ?? '发生错误'
            setMessages((prev) =>
              prev.map((m) =>
                m._id === streamingMsgId.current
                  ? { ...m, content: `❌ ${errMsg}`, isStreaming: false }
                  : m,
              ),
            )
            break
          }

          case 'done':
            if (data.conversation_id)
              conversationId.current = data.conversation_id as string
            break

          // ALL others: silently ignore
          default:
            break
        }
      }

      // ── SSE fetch + stream loop ────────────────────────────────────────────
      try {
        const response = await fetch('/api/agents/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            conversation_id: conversationId.current,
            safety_mode: 'autonomous',
            page_context: options.pageContext,
          }),
        })

        if (!response.ok) {
          const errText = await response.text()
          setMessages((prev) =>
            prev.map((m) =>
              m._id === assistantId
                ? { ...m, content: `❌ 错误: ${errText || response.statusText}`, isStreaming: false }
                : m,
            ),
          )
          return
        }

        const reader = response.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) {
              currentEvent = ''
              continue
            }
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim()
              continue
            }
            if (!trimmed.startsWith('data:')) continue

            const dataStr = trimmed.slice(5).trim()
            if (!dataStr) continue
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>
              handleEvent(currentEvent, data)
            } catch {
              // ignore invalid chunks
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setMessages((prev) =>
          prev.map((m) =>
            m._id === assistantId
              ? {
                  ...m,
                  content: `❌ 错误: ${err instanceof Error ? err.message : '连接失败'}`,
                  isStreaming: false,
                }
              : m,
          ),
        )
      } finally {
        // Parse spec and suggestions from accumulated content
        const spec = parseCronJobSpec(accContent.current)
        const suggestions = parseSuggestions(accContent.current)

        setMessages((prev) =>
          prev.map((m) =>
            m._id === streamingMsgId.current
              ? {
                  ...m,
                  isStreaming: false,
                  spec: spec ?? undefined,
                  suggestions: suggestions ?? undefined,
                }
              : m,
          ),
        )
        setIsStreaming(false)

        // Fire callbacks
        if (spec && options.onSpecDetected) {
          options.onSpecDetected(spec, streamingMsgId.current)
        }
        if (suggestions && options.onSuggestionsDetected) {
          options.onSuggestionsDetected(suggestions, streamingMsgId.current)
        }

        accContent.current = ''
        streamingMsgId.current = ''
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.pageContext, options.onSpecDetected, options.onSuggestionsDetected],
  )

  // ── cancelStreaming ─────────────────────────────────────────────────────────
  const cancelStreaming = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = null
    const runId = currentRunId
    if (runId) {
      await fetch(`/api/agents/runs/${runId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: '用户取消当前运行' }),
      }).catch(() => undefined)
    }
    setIsStreaming(false)
    // Mark any in-flight assistant message as done
    if (streamingMsgId.current) {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === streamingMsgId.current ? { ...m, isStreaming: false } : m,
        ),
      )
      streamingMsgId.current = ''
    }
  }, [currentRunId])

  // ── clearMessages ───────────────────────────────────────────────────────────
  const clearMessages = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setMessages([])
    setIsStreaming(false)
    setCurrentRunId(null)
    conversationId.current = generateUUID()
    streamingMsgId.current = ''
    accContent.current = ''
  }, [])

  return {
    messages,
    isStreaming,
    conversationId: conversationId.current,
    currentRunId,
    sendMessage,
    clearMessages,
    cancelStreaming,
  }
}
