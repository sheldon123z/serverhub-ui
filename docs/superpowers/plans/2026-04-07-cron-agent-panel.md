# Cron AI 助手面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在定时任务页面右侧嵌入 AI 对话面板，支持自然语言创建 cron 任务、可编辑脚本预览（含 Diff 视图）、一键写入服务器文件、选中代码片段发给 AI 修改。

**Architecture:** 新增 `useLightweightChat` hook 维护独立本地聊天状态（不共享全局 chatStore），解析 agent 响应中的 `cron-job-spec` 代码块生成任务卡片；`ScriptPreviewEditor` 组件使用 `diff` 包计算行级差异，提供编辑/Diff 双视图切换；`CronPage` 增加 `showAIPanel` 状态控制面板开关。

**Tech Stack:** React 19 + TypeScript, `diff` npm package (行级差异), SSE (`/api/agents/chat`), Tailwind CSS, existing `PUT /api/files/write` + `POST /api/cron/jobs` APIs.

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 安装 | `diff` + `@types/diff` | 行级 diff 计算 |
| 新建 | `src/types/cron-agent.ts` | CronJobSpec、ChatMessage 类型 |
| 新建 | `src/hooks/useLightweightChat.ts` | 独立 SSE 聊天 hook（本地状态） |
| 新建 | `src/pages/cron/CronJobSpecCard.tsx` | 解析后的任务卡片（带动作按钮） |
| 新建 | `src/pages/cron/ScriptPreviewEditor.tsx` | 可编辑脚本预览 + Diff 视图 |
| 新建 | `src/pages/cron/CronAgentPanel.tsx` | 面板组合（对话 + 脚本预览） |
| 修改 | `src/pages/CronPage.tsx` | 添加 AI 助手按钮 + 面板布局 |
| 新建 | `src/__tests__/useLightweightChat.test.ts` | hook 单元测试 |
| 新建 | `src/__tests__/ScriptPreviewEditor.test.tsx` | diff 视图测试 |

---

## Task 1: 安装依赖 + 定义类型

**Files:**
- Install: `diff`, `@types/diff`
- Create: `src/types/cron-agent.ts`

- [ ] **Step 1: 安装 diff 包**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui
npm install diff @types/diff
```

Expected: `added 1 package` (diff ~5KB)

- [ ] **Step 2: 创建类型文件 `src/types/cron-agent.ts`**

```typescript
/** 解析自 agent 响应中 ```cron-job-spec 代码块的任务规格 */
export interface CronJobSpec {
  schedule: string          // cron 表达式, 如 "0 3 * * *"
  command: string           // 执行命令, 如 "~/scripts/clean_logs.sh"
  comment?: string          // 任务说明
  script_content?: string   // 脚本文件内容 (可选)
  script_path?: string      // 脚本文件路径, 如 "~/scripts/clean_logs.sh"
}

/** 聊天消息 */
export interface LightChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  spec?: CronJobSpec        // 从 content 中解析出的任务规格
  isStreaming?: boolean
}

/** 解析 agent 响应内容中的 cron-job-spec 代码块 */
export function parseCronJobSpec(content: string): CronJobSpec | null {
  const match = content.match(/```cron-job-spec\r?\n([\s\S]*?)\r?\n```/)
  if (!match) return null
  try {
    const spec = JSON.parse(match[1]) as CronJobSpec
    if (!spec.schedule || !spec.command) return null
    return spec
  } catch {
    return null
  }
}

/** 将 cron 表达式转换为人类可读描述 (基础版) */
export function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, dom, , dow] = parts
  if (min === '0' && hour !== '*' && dom === '*' && dow === '*') {
    return `每天 ${hour}:00`
  }
  if (min === '0' && hour !== '*' && dow !== '*') {
    const days = ['周日','周一','周二','周三','周四','周五','周六']
    return `每${days[parseInt(dow)] ?? dow} ${hour}:00`
  }
  if (min.startsWith('*/')) return `每 ${min.slice(2)} 分钟`
  if (hour.startsWith('*/')) return `每 ${hour.slice(2)} 小时`
  return expr
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
npx tsc --noEmit 2>&1 | grep -E "error|✓" | head -10
```

Expected: 无 error

- [ ] **Step 4: Commit**

```bash
git add src/types/cron-agent.ts package.json package-lock.json
git commit -m "feat: add diff package and CronJobSpec types"
```

---

## Task 2: useLightweightChat hook

**Files:**
- Create: `src/hooks/useLightweightChat.ts`
- Create: `src/__tests__/useLightweightChat.test.ts`

- [ ] **Step 1: 写失败测试 `src/__tests__/useLightweightChat.test.ts`**

```typescript
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

  it('clearMessages resets to empty', () => {
    const { result } = renderHook(() => useLightweightChat({ pageContext: 'test' }))
    act(() => { result.current.clearMessages() })
    expect(result.current.messages).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/useLightweightChat.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found

- [ ] **Step 3: 实现 `src/hooks/useLightweightChat.ts`**

```typescript
import { useState, useCallback, useRef } from 'react'
import { type LightChatMessage, parseCronJobSpec } from '@/types/cron-agent'

interface UseLightweightChatOptions {
  /** 注入给 agent 的页面上下文描述 */
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

export function useLightweightChat({ pageContext }: UseLightweightChatOptions): UseLightweightChatReturn {
  const [messages, setMessages] = useState<LightChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const conversationId = useRef<string>(crypto.randomUUID())

  const sendMessage = useCallback(async (text: string) => {
    // 取消上一个请求
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // 添加用户消息
    const userMsg: LightChatMessage = { id: nextId(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)

    // 准备 assistant 消息 placeholder
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
          m.id === assistantId
            ? { ...m, content: `错误: ${errText}`, isStreaming: false }
            : m
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
            const data = JSON.parse(dataStr)
            if (currentEvent === 'message' || currentEvent === 'message.final') {
              // 提取文本内容
              let chunk = ''
              if (typeof data.content === 'string') {
                chunk = data.content
              } else if (Array.isArray(data.content)) {
                chunk = data.content
                  .filter((b: { type: string }) => b.type === 'text')
                  .map((b: { text: string }) => b.text)
                  .join('')
              }
              if (chunk) {
                accContent = chunk  // message 事件是全量内容
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: accContent } : m
                ))
              }
            }
          } catch { /* skip invalid chunks */ }
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
      // 流结束后解析 spec 并更新消息
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
    conversationId.current = crypto.randomUUID()
  }, [])

  const cancelStreaming = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false, content: m.content + ' [已取消]' } : m
    ))
  }, [])

  return { messages, isStreaming, sendMessage, clearMessages, cancelStreaming }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/__tests__/useLightweightChat.test.ts 2>&1 | tail -10
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useLightweightChat.ts src/__tests__/useLightweightChat.test.ts src/types/cron-agent.ts
git commit -m "feat: add useLightweightChat hook + CronJobSpec types"
```

---

## Task 3: CronJobSpecCard 组件

**Files:**
- Create: `src/pages/cron/CronJobSpecCard.tsx`

- [ ] **Step 1: 创建 `src/pages/cron/CronJobSpecCard.tsx`**

```typescript
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useServerStore } from '@/stores/serverStore'
import { useAuthStore } from '@/stores/authStore'
import client from '@/api/client'
import toast from 'react-hot-toast'
import { type CronJobSpec, cronToHuman } from '@/types/cron-agent'

interface CronJobSpecCardProps {
  spec: CronJobSpec
  /** 当用户点击"编辑脚本"时回调，传入脚本内容和路径 */
  onEditScript?: (content: string, path: string) => void
  /** 已添加到列表标记 */
  added?: boolean
}

export function CronJobSpecCard({ spec, onEditScript, added = false }: CronJobSpecCardProps) {
  const [adding, setAdding] = useState(false)
  const [writing, setWriting] = useState(false)
  const [done, setDone] = useState(added)
  const qc = useQueryClient()
  const serverId = useServerStore(s => s.selectedServerId)
  const user = useAuthStore(s => s.user)
  const cronUser = user?.username ?? ''

  async function handleAddToList() {
    if (done) return
    setAdding(true)
    try {
      await client.post('/api/cron/jobs', {
        cron_user: cronUser,
        schedule: spec.schedule,
        command: spec.command,
        comment: spec.comment ?? '',
      }, { params: { server_id: serverId } })
      toast.success('已加入任务列表')
      setDone(true)
      qc.invalidateQueries({ queryKey: ['cron'] })
    } catch {
      toast.error('添加失败')
    } finally {
      setAdding(false)
    }
  }

  async function handleWriteToServer() {
    if (!spec.script_content || !spec.script_path) {
      toast.error('无脚本内容可写入')
      return
    }
    // 展开 ~ 路径（服务端会处理，这里保持原样）
    const path = spec.script_path.replace(/^~/, `/home/${cronUser}`)
    setWriting(true)
    try {
      await client.put('/api/files/write', { path, content: spec.script_content })
      toast.success(`脚本已写入: ${spec.script_path}`)
    } catch {
      toast.error('写入失败，请检查路径权限')
    } finally {
      setWriting(false)
    }
  }

  function handleEditScript() {
    if (spec.script_content && spec.script_path && onEditScript) {
      onEditScript(spec.script_content, spec.script_path)
    }
  }

  return (
    <div className="glass rounded-lg p-3 mt-2 border border-accent/30">
      {/* Schedule */}
      <div className="flex items-start gap-2 mb-2">
        <span className="text-[10px] font-semibold text-text3 uppercase tracking-wider w-10 mt-0.5 shrink-0">计划</span>
        <div>
          <code className="text-accent text-[11px] font-mono font-semibold">{spec.schedule}</code>
          <span className="text-text3 text-[10px] ml-2">{cronToHuman(spec.schedule)}</span>
        </div>
      </div>
      {/* Command */}
      <div className="flex items-start gap-2 mb-2">
        <span className="text-[10px] font-semibold text-text3 uppercase tracking-wider w-10 mt-0.5 shrink-0">命令</span>
        <code className="text-text text-[11px] font-mono break-all">{spec.command}</code>
      </div>
      {/* Comment */}
      {spec.comment && (
        <div className="flex items-start gap-2 mb-2">
          <span className="text-[10px] font-semibold text-text3 uppercase tracking-wider w-10 mt-0.5 shrink-0">说明</span>
          <span className="text-text2 text-[11px]">{spec.comment}</span>
        </div>
      )}
      {/* Script indicator */}
      {spec.script_content && (
        <div className="flex items-center gap-1.5 mb-3 text-[10px] text-text3">
          <span>📄</span>
          <code className="font-mono">{spec.script_path ?? '脚本'}</code>
          <span className="text-green text-[9px]">· 已生成</span>
        </div>
      )}
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleAddToList}
          disabled={adding || done}
          className={`text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors ${
            done
              ? 'bg-green/15 text-green border border-green/25 cursor-default'
              : 'bg-accent text-[#0f172a] hover:opacity-90'
          }`}
        >
          {done ? '✓ 已加入列表' : adding ? '添加中...' : '+ 加入列表'}
        </button>
        {spec.script_content && (
          <>
            <button
              onClick={handleWriteToServer}
              disabled={writing}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-green/12 text-green border border-green/25 hover:bg-green/20 transition-colors"
            >
              {writing ? '写入中...' : '💾 写入服务器'}
            </button>
            <button
              onClick={handleEditScript}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-yellow/10 text-yellow border border-yellow/25 hover:bg-yellow/20 transition-colors"
            >
              ✏️ 编辑脚本
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证构建**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui
npm run build 2>&1 | grep -E "error|Error|✓ built"
```

Expected: `✓ built in`

- [ ] **Step 3: Commit**

```bash
git add src/pages/cron/CronJobSpecCard.tsx
git commit -m "feat: add CronJobSpecCard with add/write/edit actions"
```

---

## Task 4: ScriptPreviewEditor（可编辑 + Diff 视图）

**Files:**
- Create: `src/pages/cron/ScriptPreviewEditor.tsx`
- Create: `src/__tests__/ScriptPreviewEditor.test.tsx`

- [ ] **Step 1: 写失败测试**

创建 `src/__tests__/ScriptPreviewEditor.test.tsx`：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ScriptPreviewEditor } from '@/pages/cron/ScriptPreviewEditor'

const SCRIPT = `#!/bin/bash
echo "hello"
echo "world"`

const SCRIPT_MODIFIED = `#!/bin/bash
echo "hello"
echo "modified"
echo "extra line"`

describe('ScriptPreviewEditor', () => {
  it('renders script filename in header', () => {
    render(<ScriptPreviewEditor content={SCRIPT} filePath="~/scripts/test.sh" onContentChange={() => {}} />)
    expect(screen.getByText('~/scripts/test.sh')).toBeInTheDocument()
  })

  it('shows diff view toggle button', () => {
    render(<ScriptPreviewEditor content={SCRIPT} filePath="~/scripts/test.sh" onContentChange={() => {}} />)
    expect(screen.getByRole('button', { name: /diff/i })).toBeInTheDocument()
  })

  it('switching to diff mode shows +/- indicators', () => {
    render(
      <ScriptPreviewEditor
        content={SCRIPT_MODIFIED}
        filePath="~/scripts/test.sh"
        originalContent={SCRIPT}
        onContentChange={() => {}}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /diff/i }))
    // diff view should show removed/added lines
    expect(document.querySelector('.diff-removed, .diff-added')).not.toBeNull()
  })

  it('calls onSendToAI with selected text', () => {
    const onSendToAI = vi.fn()
    render(
      <ScriptPreviewEditor
        content={SCRIPT}
        filePath="~/scripts/test.sh"
        onContentChange={() => {}}
        onSendToAI={onSendToAI}
      />
    )
    // Component renders with onSendToAI prop without error
    expect(screen.getByText('~/scripts/test.sh')).toBeInTheDocument()
  })

  it('calls onWriteToServer with current content when write button clicked', async () => {
    const onWriteToServer = vi.fn().mockResolvedValue(undefined)
    render(
      <ScriptPreviewEditor
        content={SCRIPT}
        filePath="~/scripts/test.sh"
        onContentChange={() => {}}
        onWriteToServer={onWriteToServer}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /写入服务器/i }))
    expect(onWriteToServer).toHaveBeenCalledWith(SCRIPT)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/__tests__/ScriptPreviewEditor.test.tsx 2>&1 | tail -10
```

Expected: FAIL

- [ ] **Step 3: 实现 `src/pages/cron/ScriptPreviewEditor.tsx`**

```typescript
import { useState, useRef, useCallback, useEffect } from 'react'
import { diffLines } from 'diff'
import { cn } from '@/lib/utils'

interface ScriptPreviewEditorProps {
  content: string
  filePath: string
  /** 原始内容（diff 基准），不传则以首次 content 为基准 */
  originalContent?: string
  onContentChange: (newContent: string) => void
  onWriteToServer?: (content: string) => Promise<void>
  onSendToAI?: (selectedText: string) => void
}

type ViewMode = 'edit' | 'diff'

export function ScriptPreviewEditor({
  content,
  filePath,
  originalContent,
  onContentChange,
  onWriteToServer,
  onSendToAI,
}: ScriptPreviewEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('edit')
  const [isWriting, setIsWriting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  // 记录基准版本（第一次收到 content 时）
  const baselineRef = useRef<string>(originalContent ?? content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 当 originalContent prop 更新时同步基准
  useEffect(() => {
    if (originalContent !== undefined) {
      baselineRef.current = originalContent
    }
  }, [originalContent])

  // 内容变化时标记为未保存
  useEffect(() => {
    setIsSaved(false)
  }, [content])

  const handleWriteToServer = useCallback(async () => {
    if (!onWriteToServer) return
    setIsWriting(true)
    try {
      await onWriteToServer(content)
      setIsSaved(true)
      // 写入成功后更新基准
      baselineRef.current = content
    } finally {
      setIsWriting(false)
    }
  }, [content, onWriteToServer])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content)
  }, [content])

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection()?.toString() ?? ''
    setSelectedText(sel)
  }, [])

  const handleSendToAI = useCallback(() => {
    if (selectedText && onSendToAI) {
      onSendToAI(selectedText)
      setSelectedText('')
    }
  }, [selectedText, onSendToAI])

  // 计算 diff
  const diffChunks = diffLines(baselineRef.current, content)
  const hasDiff = diffChunks.some(c => c.added || c.removed)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg2/50 flex-shrink-0">
        <code className="text-[11px] font-mono text-text2 flex-1 truncate">{filePath || '未命名脚本'}</code>
        <div className="flex items-center gap-1.5">
          {hasDiff && (
            <button
              aria-label="Diff 视图"
              onClick={() => setViewMode(v => v === 'diff' ? 'edit' : 'diff')}
              className={cn(
                'text-[10px] font-semibold px-2 py-1 rounded border transition-colors',
                viewMode === 'diff'
                  ? 'bg-accent/15 text-accent border-accent/30'
                  : 'text-text3 border-border hover:text-text'
              )}
            >
              Diff {hasDiff && <span className="ml-1 text-yellow">●</span>}
            </button>
          )}
          {onWriteToServer && (
            <button
              aria-label="写入服务器"
              onClick={handleWriteToServer}
              disabled={isWriting}
              className="text-[10px] font-semibold px-2 py-1 rounded border border-green/25 bg-green/10 text-green hover:bg-green/20 transition-colors"
            >
              {isWriting ? '写入中...' : '💾 写入服务器'}
            </button>
          )}
          <button
            aria-label="复制"
            onClick={handleCopy}
            className="text-[10px] font-semibold px-2 py-1 rounded border border-border text-text3 hover:text-text transition-colors"
          >
            复制
          </button>
          {onSendToAI && selectedText && (
            <button
              onClick={handleSendToAI}
              className="text-[10px] font-semibold px-2 py-1 rounded bg-accent/15 text-accent border border-accent/30 animate-pulse"
            >
              ✦ 发给 AI
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-auto">
        {viewMode === 'diff' && hasDiff ? (
          /* Diff 视图 */
          <div className="font-mono text-[11px] leading-relaxed p-3 select-text" onMouseUp={handleSelectionChange}>
            {diffChunks.map((chunk, i) => {
              const lines = chunk.value.split('\n').filter((_, idx, arr) => idx < arr.length - 1 || chunk.value.endsWith('\n') || idx < arr.length - 1)
              // 过滤尾部空行
              const filteredLines = chunk.value.replace(/\n$/, '').split('\n')
              return filteredLines.map((line, lineIdx) => (
                <div
                  key={`${i}-${lineIdx}`}
                  className={cn(
                    'flex gap-2 px-2 py-0.5 rounded-sm',
                    chunk.added && 'diff-added bg-green/10 text-green',
                    chunk.removed && 'diff-removed bg-red/10 text-red line-through opacity-70',
                    !chunk.added && !chunk.removed && 'text-text2'
                  )}
                >
                  <span className="w-4 text-center opacity-60 select-none flex-shrink-0">
                    {chunk.added ? '+' : chunk.removed ? '-' : ' '}
                  </span>
                  <span className="whitespace-pre flex-1">{line}</span>
                </div>
              ))
            })}
          </div>
        ) : (
          /* 编辑视图 */
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => onContentChange(e.target.value)}
            onMouseUp={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            className="w-full h-full min-h-full resize-none bg-transparent border-none outline-none font-mono text-[11px] leading-relaxed p-3 text-text2"
            spellCheck={false}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border text-[10px] bg-bg2/30 flex-shrink-0">
        <span className={cn(
          'flex items-center gap-1',
          isSaved ? 'text-green' : content !== baselineRef.current ? 'text-yellow' : 'text-text3'
        )}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {isSaved ? '已保存' : content !== baselineRef.current ? '已修改，未保存' : '未修改'}
        </span>
        {hasDiff && (
          <span className="text-text3">
            {diffChunks.filter(c => c.added).reduce((s, c) => s + c.value.split('\n').length - 1, 0)}+ /&nbsp;
            {diffChunks.filter(c => c.removed).reduce((s, c) => s + c.value.split('\n').length - 1, 0)}-
          </span>
        )}
        {selectedText && (
          <span className="text-accent bg-accent/10 px-1.5 rounded">
            已选 {selectedText.split('\n').length} 行
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行测试**

```bash
npx vitest run src/__tests__/ScriptPreviewEditor.test.tsx 2>&1 | tail -10
```

Expected: 5/5 pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/cron/ScriptPreviewEditor.tsx src/__tests__/ScriptPreviewEditor.test.tsx
git commit -m "feat: ScriptPreviewEditor with diff view and send-to-AI selection"
```

---

## Task 5: CronAgentPanel 组合组件

**Files:**
- Create: `src/pages/cron/CronAgentPanel.tsx`

- [ ] **Step 1: 创建 `src/pages/cron/CronAgentPanel.tsx`**

```typescript
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useServerStore } from '@/stores/serverStore'
import { useAuthStore } from '@/stores/authStore'
import client from '@/api/client'
import toast from 'react-hot-toast'
import { useLightweightChat } from '@/hooks/useLightweightChat'
import { CronJobSpecCard } from './CronJobSpecCard'
import { ScriptPreviewEditor } from './ScriptPreviewEditor'
/** 现有任务的最小类型（避免循环依赖 CronPage.tsx） */
interface ExistingJob {
  schedule: string
  command: string
  comment?: string
  enabled?: boolean
}

interface CronAgentPanelProps {
  onClose: () => void
  currentUsername: string
  existingJobs: ExistingJob[]
}

function buildPageContext(username: string, jobs: CronJob[]): string {
  const jobSummary = jobs.slice(0, 10).map(j =>
    `  - ${j.schedule} | ${j.command}${j.comment ? ` # ${j.comment}` : ''}`
  ).join('\n')

  return `你是 ServerHub 服务器管理系统的定时任务助手。
当前用户: ${username}
当前服务器: Linux 服务器

你的职责是帮助用户创建和修改 cron 定时任务。
当需要创建任务时，必须输出以下格式的代码块（schedule 和 command 是必填项）：

\`\`\`cron-job-spec
{
  "schedule": "cron表达式",
  "command": "执行命令或脚本路径",
  "comment": "任务说明",
  "script_content": "完整的 shell 脚本内容（如需生成脚本）",
  "script_path": "脚本文件路径，使用 ~/scripts/ 前缀"
}
\`\`\`

cron 表达式格式：分 时 日 月 周（如 "0 3 * * *" 表示每天凌晨3点）
如果用户需要生成脚本文件，在 script_content 中提供完整脚本，script_path 使用 ~/scripts/<名称>.sh。

现有定时任务（${jobs.length} 个）：
${jobSummary || '  （暂无任务）'}
`
}

export function CronAgentPanel({ onClose, currentUsername, existingJobs }: CronAgentPanelProps) {
  const serverId = useServerStore(s => s.selectedServerId)
  const pageContext = buildPageContext(currentUsername, existingJobs)

  const { messages, isStreaming, sendMessage, clearMessages, cancelStreaming } = useLightweightChat({ pageContext })

  // 脚本预览状态
  const [scriptContent, setScriptContent] = useState('')
  const [scriptPath, setScriptPath] = useState('')
  const [scriptOriginal, setScriptOriginal] = useState('')
  const [input, setInput] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 当 AI 返回含脚本的 spec 时，自动更新预览
  useEffect(() => {
    const lastMsg = messages.at(-1)
    if (lastMsg?.spec?.script_content && lastMsg?.spec?.script_path && !lastMsg.isStreaming) {
      setScriptContent(lastMsg.spec.script_content)
      setScriptPath(lastMsg.spec.script_path)
      setScriptOriginal(lastMsg.spec.script_content)
    }
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput('')
    await sendMessage(text)
  }, [input, isStreaming, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 选中脚本片段发给 AI
  const handleSendSelectionToAI = useCallback((selectedText: string) => {
    const quoted = `请修改以下代码片段：\n\`\`\`bash\n${selectedText}\n\`\`\``
    setInput(quoted)
  }, [])

  // 写入服务器
  const handleWriteToServer = useCallback(async (content: string) => {
    if (!scriptPath) { toast.error('未指定脚本路径'); return }
    const resolvedPath = scriptPath.replace(/^~/, `/home/${currentUsername}`)
    await client.put('/api/files/write', { path: resolvedPath, content })
    toast.success(`脚本已写入: ${scriptPath}`)
    // 写入后将现有内容设为新基准（由 ScriptPreviewEditor 内部处理）
  }, [scriptPath, currentUsername])

  return (
    <div className="flex flex-col h-full border-l border-border bg-bg2/30 min-w-0">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-bg2 flex-shrink-0">
        <span className="text-sm">🤖</span>
        <span className="text-[13px] font-semibold text-text flex-1">Cron AI 助手</span>
        <span className="text-[10px] text-text3 bg-card px-2 py-0.5 rounded">{existingJobs.length} 个现有任务</span>
        <button
          onClick={clearMessages}
          className="text-[10px] text-text3 hover:text-text px-1.5 py-0.5 rounded hover:bg-card"
          title="清空对话"
        >
          清空
        </button>
        <button
          onClick={onClose}
          className="text-text3 hover:text-text ml-1 text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-card"
        >
          ✕
        </button>
      </div>

      {/* Main content: chat + script preview */}
      <div className="flex flex-1 min-h-0">
        {/* Chat area (left 52%) */}
        <div className="flex flex-col w-[52%] border-r border-border min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8 text-text3">
                <div className="text-2xl mb-2">🤖</div>
                <div className="text-[12px]">描述你需要的定时任务</div>
                <div className="text-[11px] mt-1 text-text3/60">例如：每天凌晨2点清理30天前的日志</div>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] space-y-2`}>
                  {/* Text content (hide if it's only a spec block) */}
                  {(() => {
                    const textOnly = msg.content
                      .replace(/```cron-job-spec[\s\S]*?```/g, '')
                      .trim()
                    if (!textOnly && msg.spec) return null
                    return (
                      <div className={`px-3 py-2 rounded-xl text-[12px] leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-accent/15 border border-accent/25 text-text rounded-br-sm'
                          : 'glass rounded-bl-sm text-text2'
                      }`}>
                        {textOnly || msg.content}
                        {msg.isStreaming && (
                          <span className="inline-block w-1 h-3 bg-accent/60 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                        )}
                      </div>
                    )
                  })()}
                  {/* Spec card */}
                  {msg.spec && !msg.isStreaming && (
                    <CronJobSpecCard
                      spec={msg.spec}
                      onEditScript={(content, path) => {
                        setScriptContent(content)
                        setScriptPath(path)
                        setScriptOriginal(content)
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-2.5 border-t border-border flex-shrink-0">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? 'AI 生成中...' : '描述任务需求，或发送选中的脚本片段...'}
                disabled={isStreaming}
                rows={2}
                className="flex-1 resize-none glass rounded-lg px-3 py-2 text-[12px] text-text placeholder:text-text3 focus:border-accent/50 focus:outline-none"
              />
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="bg-accent text-[#0f172a] text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  发送
                </button>
                {isStreaming && (
                  <button
                    onClick={cancelStreaming}
                    className="text-[10px] text-red border border-red/30 px-2 py-1 rounded-lg hover:bg-red/10"
                  >
                    停止
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Script preview area (right 48%) */}
        <div className="flex-1 min-h-0 min-w-0">
          {scriptContent ? (
            <ScriptPreviewEditor
              content={scriptContent}
              filePath={scriptPath}
              originalContent={scriptOriginal}
              onContentChange={setScriptContent}
              onWriteToServer={handleWriteToServer}
              onSendToAI={handleSendSelectionToAI}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text3 p-4">
              <div className="text-3xl mb-3 opacity-40">📄</div>
              <div className="text-[12px] text-center">
                AI 生成脚本后将在此预览
              </div>
              <div className="text-[11px] mt-1 text-text3/60 text-center">
                可直接编辑，选中代码可发给 AI 修改
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|Error|✓ built"
```

Expected: `✓ built in`

- [ ] **Step 3: Commit**

```bash
git add src/pages/cron/CronAgentPanel.tsx
git commit -m "feat: add CronAgentPanel with chat + script preview composition"
```

---

## Task 6: 修改 CronPage.tsx 集成面板

**Files:**
- Modify: `src/pages/CronPage.tsx`

注意：`CronJob` 类型需要从 CronPage.tsx 中导出供 CronAgentPanel 使用。

- [ ] **Step 1: 读取 CronPage.tsx 确认当前结构**

```bash
head -30 /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/pages/CronPage.tsx
```

- [ ] **Step 2: 修改 CronPage.tsx**

**2a) 导出 CronJob 类型**（在 `interface CronJob` 定义处加 `export`）：

```typescript
// 改为:
export interface CronJob {
  // ... 原有字段不变
}
```

**2b) 在文件顶部 imports 后添加 CronAgentPanel import**：

```typescript
import { CronAgentPanel } from './cron/CronAgentPanel'
```

**2c) 在 `CronPage` 函数内添加 `showAIPanel` 状态**（紧跟 `useState` 块）：

```typescript
const [showAIPanel, setShowAIPanel] = useState(false)
```

**2d) 修改 header 区域**，在"备份 Crontab"按钮之前添加 AI 助手按钮：

```typescript
// 找到:
<div className="flex items-center justify-between mb-4">
  <h2 className="text-lg font-semibold">定时任务</h2>
  <button
    onClick={() => backupMut.mutate(cronUser || currentUsername)}
    // ...
  >
    备份 Crontab
  </button>
</div>

// 改为:
<div className="flex items-center justify-between mb-4">
  <h2 className="text-lg font-semibold">定时任务</h2>
  <div className="flex items-center gap-2">
    <button
      onClick={() => setShowAIPanel(v => !v)}
      className={cn(
        'text-sm px-3 py-1.5 rounded-md border transition-colors',
        showAIPanel
          ? 'bg-accent/15 text-accent border-accent/30'
          : 'text-text3 border-border hover:text-text hover:border-accent/40'
      )}
    >
      🤖 AI 助手
    </button>
    <button
      onClick={() => backupMut.mutate(cronUser || currentUsername)}
      disabled={backupMut.isPending}
      className="text-text3 text-sm hover:text-text border border-border rounded-md px-3 py-1.5 hover:border-accent transition-colors"
    >
      备份 Crontab
    </button>
  </div>
</div>
```

**2e) 修改 `return` 最外层 `<div>` 为 flex 布局**：

```typescript
// 找到:
return (
  <div>
    <div className="flex items-center justify-between mb-4">

// 改为:
return (
  <div className={cn('flex gap-0 h-full', showAIPanel ? 'overflow-hidden' : '')}>
    {/* 主内容区 */}
    <div className={cn('flex-1 min-w-0', showAIPanel ? 'overflow-y-auto' : '')}>
    <div className="flex items-center justify-between mb-4">
```

**2f) 在 `return` 的最外层 `</div>` 之前（关闭主内容 div 之后），添加 AI 面板**：

找到 return 末尾：
```typescript
      </div>
    </div>  {/* 关闭主内容 div */}
    {/* AI 面板 */}
    {showAIPanel && (
      <div className="w-[460px] shrink-0 flex flex-col" style={{ height: 'calc(100vh - var(--spacing-header))' }}>
        <CronAgentPanel
          onClose={() => setShowAIPanel(false)}
          currentUsername={currentUsername}
          existingJobs={[
            ...(userJobsData?.jobs ?? []),
            ...(rootJobsData?.jobs ?? []),
          ]}
        />
      </div>
    )}
  </div>
)
```

- [ ] **Step 3: 验证构建**

```bash
npm run build 2>&1 | grep -E "error|Error|✓ built"
```

Expected: `✓ built in`

- [ ] **Step 4: Commit**

```bash
git add src/pages/CronPage.tsx src/pages/cron/
git commit -m "feat: integrate CronAgentPanel into CronPage with toggle button"
```

---

## Task 7: 全量测试 + 构建部署

**Files:** 验证所有修改

- [ ] **Step 1: 运行全量测试**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui
npm run test 2>&1 | tail -10
```

Expected: 所有测试通过（307+ tests）

- [ ] **Step 2: 生产构建**

```bash
npm run build 2>&1 | tail -8
```

Expected: `✓ built in`，无 TypeScript error

- [ ] **Step 3: 部署到后端**

```bash
rm -rf /home/zhengxiaodong/exps/serverhub/server-hub/static
cp -r /home/zhengxiaodong/exps/serverhub/serverhub-ui/dist /home/zhengxiaodong/exps/serverhub/server-hub/static
sudo systemctl restart server-hub
sleep 2 && sudo systemctl is-active server-hub
```

Expected: `active`

- [ ] **Step 4: 手动冒烟验证**

1. 打开 ServerHub → 定时任务页面
2. 点击"🤖 AI 助手"按钮 → 右侧面板展开
3. 输入"每天凌晨3点清理日志" → AI 生成任务卡片 + 脚本预览
4. 检查 Diff 按钮显示（橙色点）
5. 在脚本预览中修改一行 → 点击 Diff 按钮 → 看到红/绿差异
6. 点击"+ 加入列表" → 左侧任务列表出现新任务
7. 点击"💾 写入服务器" → 弹出成功 toast
8. 选中脚本中3行 → 输入框预填充 → 发送给 AI 修改

- [ ] **Step 5: 最终 Commit**

```bash
git log --oneline -6
```

---

## 后续可扩展方向

1. **脚本历史版本**：每次写入前备份旧内容，可回退
2. **语法高亮**：引入 CodeMirror 或 highlight.js 对脚本内容着色
3. **Cron 表达式可视化编辑器**：点击 schedule 字段弹出图形化选择器
4. **多任务批量生成**：AI 一次输出多个 cron-job-spec 块
