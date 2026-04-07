import { useState, useCallback, useRef } from 'react'
import { type LightChatMessage, parseCronJobSpec } from '@/types/cron-agent'

interface UseLightweightChatOptions {
  pageContext: string
}

interface UseLightweightChatReturn {
  messages: LightChatMessage[]
  isStreaming: boolean
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
  cancelStreaming: () => void
}

let _msgCounter = 0
function nextId() { return `lc_${++_msgCounter}_${Date.now()}` }

/** 兼容非 HTTPS 环境（LAN 访问）的 UUID 生成 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** Extract text content from string or ContentBlock array (matches useSSEChat pattern) */
function extractContent(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
  }
  return ''
}

export function useLightweightChat({ pageContext }: UseLightweightChatOptions): UseLightweightChatReturn {
  const [messages, setMessages] = useState<LightChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const conversationId = useRef<string>(generateUUID())
  const currentRunId = useRef<string | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const userMsg: LightChatMessage = { id: nextId(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)

    const assistantId = nextId()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', isStreaming: true }])

    let accContent = ''

    try {
      const response = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId.current,
          safety_mode: false,
          page_context: pageContext,
        }),
      })

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => response.statusText)
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: `错误: ${errText}`, isStreaming: false } : m
        ))
        return
      }

      const reader = response.body.getReader()
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
          if (!trimmed) { currentEvent = ''; continue }
          if (trimmed.startsWith('event:')) { currentEvent = trimmed.slice(6).trim(); continue }
          if (!trimmed.startsWith('data:')) continue
          const dataStr = trimmed.slice(5).trim()
          if (!dataStr) continue

          try {
            const data = JSON.parse(dataStr) as Record<string, unknown>

            switch (currentEvent) {
              case 'run.started':
                if (data.run_id) {
                  currentRunId.current = data.run_id as string
                }
                break

              case 'message':
              case 'message.final': {
                const chunk = extractContent(data.content)
                if (chunk) {
                  accContent = chunk
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: accContent } : m
                  ))
                }
                break
              }

              case 'tool.call':
              case 'tool_call': {
                const toolName = (data.tool as string) ?? (data.name as string) ?? '工具'
                const indicator = `\n\n🔧 正在调用: ${toolName}...`
                setMessages(prev => prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: accContent + indicator }
                    : m
                ))
                break
              }

              case 'tool.result':
              case 'tool_result':
                // Silently ignore — restore clean content without tool indicator
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: accContent } : m
                ))
                break

              case 'run.completed':
                if (data.run_id) {
                  currentRunId.current = data.run_id as string
                }
                // Mark streaming done; finally block will finalize
                break

              case 'run.error':
              case 'error': {
                const errMsg = (data.error as string) ?? '未知错误'
                accContent = `错误: ${errMsg}`
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: accContent } : m
                ))
                break
              }

              case 'done':
                if (data.conversation_id) {
                  conversationId.current = data.conversation_id as string
                }
                if (data.run_id) {
                  currentRunId.current = data.run_id as string
                }
                break

              // Silently ignore all other event types:
              // todo.update, task.update, approval.request,
              // ui.render, ui.update, ui.remove, artifact.update
              default:
                break
            }
          } catch { /* skip invalid JSON chunks */ }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `连接失败: ${err instanceof Error ? err.message : '未知错误'}`, isStreaming: false }
          : m
      ))
    } finally {
      const spec = parseCronJobSpec(accContent)
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, isStreaming: false, spec: spec ?? undefined } : m
      ))
      setIsStreaming(false)
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [pageContext])

  const clearMessages = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setIsStreaming(false)
    conversationId.current = generateUUID()
    currentRunId.current = null
  }, [])

  const cancelStreaming = useCallback(async () => {
    const runId = currentRunId.current
    abortRef.current?.abort()
    setIsStreaming(false)
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false, content: m.content + ' [已取消]' } : m
    ))
    // Best-effort server-side cancel
    if (runId) {
      try {
        await fetch(`/api/agents/runs/${runId}/cancel`, {
          method: 'POST',
          credentials: 'include',
        })
      } catch { /* ignore cancel errors */ }
    }
  }, [])

  return { messages, isStreaming, sendMessage, clearMessages, cancelStreaming }
}
