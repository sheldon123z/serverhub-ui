import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLightweightChat } from '@/hooks/useLightweightChat'
import { parseCronJobSpec } from '@/types/cron-agent'

describe('parseCronJobSpec', () => {
  it('parses valid cron-job-spec block', () => {
    const content = `好的，生成如下：
\`\`\`cron-job-spec
{"schedule":"0 3 * * *","command":"~/scripts/clean.sh","comment":"清理日志","script_content":"#!/bin/bash\necho done","script_path":"~/scripts/clean.sh"}
\`\`\``
    const result = parseCronJobSpec(content)
    expect(result).not.toBeNull()
    expect(result?.schedule).toBe('0 3 * * *')
    expect(result?.command).toBe('~/scripts/clean.sh')
    expect(result?.script_content).toBe('#!/bin/bash\necho done')
  })

  it('returns null for missing schedule', () => {
    const content = '```cron-job-spec\n{"command":"ls"}\n```'
    expect(parseCronJobSpec(content)).toBeNull()
  })

  it('returns null when no spec block present', () => {
    expect(parseCronJobSpec('普通回答，没有代码块')).toBeNull()
  })
})

describe('useLightweightChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock matchMedia for themeStore
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: vi.fn(), removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('initializes with empty messages', () => {
    const { result } = renderHook(() => useLightweightChat({ pageContext: 'test' }))
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.isStreaming).toBe(false)
  })

  it('adds user message on sendMessage', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: run.done\ndata: {}\n\n'))
          controller.close()
        }
      })
    })

    const { result } = renderHook(() => useLightweightChat({ pageContext: 'test' }))
    await act(async () => {
      await result.current.sendMessage('每天备份')
    })

    const userMsg = result.current.messages.find(m => m.role === 'user')
    expect(userMsg?.content).toBe('每天备份')
  })

  it('clearMessages resets to empty', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(c) { c.close() } })
    })
    const { result } = renderHook(() => useLightweightChat({ pageContext: 'test' }))
    await act(async () => { await result.current.sendMessage('test') })
    act(() => { result.current.clearMessages() })
    expect(result.current.messages).toHaveLength(0)
  })
})
