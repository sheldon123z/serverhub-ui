import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerStore } from '@/stores/serverStore'
import client from '@/api/client'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { useScopedSSEChat } from '@/hooks/useScopedSSEChat'
import { type CronJobSpec, type ScriptRegistryEntry, type ScopedMessage, parseCronJobSpec, parseSuggestions } from '@/types/cron-agent'
import { CronJobSpecCard } from './CronJobSpecCard'
import { CronActionBar } from './CronActionBar'
import { SuggestionChips } from './SuggestionChips'
import { ScriptLinkBlock } from './ScriptLinkBlock'
import { ScriptPreviewEditor } from './ScriptPreviewEditor'
import { ScriptFileTree } from './ScriptFileTree'
import { ScriptTemplateSelector } from './ScriptTemplateSelector'
import { MarkdownContent } from '@/pages/agents/MarkdownContent'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

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

function buildPageContext(username: string, jobs: ExistingJob[]): string {
  const jobList = jobs.slice(0, 15).map(j =>
    `[${j.enabled ? '✓' : '✗'}] ${j.schedule}  ${j.command}${j.comment ? `  # ${j.comment}` : ''}`
  ).join('\n')

  return `# Cron Task Assistant

You are a specialized cron job assistant for a Linux server management system (ServerHub).

## Your Role
- Help users create, modify, and manage cron scheduled tasks
- Generate shell scripts when needed
- Explain cron expressions in plain Chinese

## Rules
1. When creating a new task, you MUST output a \`cron-job-spec\` code block in this exact format:

\`\`\`cron-job-spec
{
  "schedule": "0 3 * * *",
  "command": "~/scripts/example.sh",
  "comment": "Brief task description in Chinese",
  "script_content": "#!/bin/bash\\nset -euo pipefail\\n\\n# Script content here",
  "script_path": "~/scripts/example.sh"
}
\`\`\`

2. Cron expression format: \`minute hour day month weekday\`
3. Scripts MUST start with \`#!/bin/bash\` and \`set -euo pipefail\`
4. Scripts should be saved to \`~/scripts/\` directory
5. Always add logging to scripts (append to /tmp/ or ~/logs/)
6. When modifying existing scripts, output the complete updated version
7. Respond concisely in Chinese
8. **创建定时任务时，必须使用 \`setup_scheduled_task\` 工具一体化完成**（自动处理：验证→写脚本→设权限→语法检查→写入crontab→回读验证）。不要分步调用多个 cron 工具。
9. When providing optimization suggestions, output a \`suggestions\` code block:

\`\`\`suggestions
["选项一", "选项二", "选项三"]
\`\`\`

## Current Environment
- User: ${username}
- Existing tasks (${jobs.length}):
${jobList || '(none)'}

## Available Script Directory
~/scripts/ — all generated scripts should be placed here
`
}

const PROMPT_STORAGE_KEY = 'serverhub-cron-agent-prompt'

export function CronAgentPanel({ onClose, currentUsername, existingJobs }: CronAgentPanelProps) {
  void useServerStore(s => s.selectedServerId)
  const qc = useQueryClient()

  // Prompt 配置
  const defaultPrompt = buildPageContext(currentUsername, existingJobs)
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(() => {
    return localStorage.getItem(PROMPT_STORAGE_KEY) || ''
  })
  const activePrompt = editingPrompt.trim() || defaultPrompt

  // Script registry — tracks all generated scripts in conversation
  const [scriptRegistry, setScriptRegistry] = useState<ScriptRegistryEntry[]>([])
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [templateVersion, setTemplateVersion] = useState(0) // triggers re-render when templates change

  const STORAGE_KEY = 'serverhub-cron-conversation-id'

  const {
    messages, isStreaming, sendMessage, clearMessages, cancelStreaming, loadConversation, conversationId,
    todos, pendingApproval, activeToolCalls, completedToolCount, totalToolCount, resolveApproval,
  } = useScopedSSEChat({
    pageContext: 'cron',
    pageSystemPrompt: activePrompt,
    storageKey: STORAGE_KEY,
    onSpecDetected: (spec, messageId) => {
      const content = spec.script_content
      const path = spec.script_path ?? spec.command ?? ''
      if (content) {
        const entry: ScriptRegistryEntry = {
          id: `script_${Date.now()}`,
          path,
          content,
          messageId,
          timestamp: Date.now(),
          lineCount: content.split('\n').length,
        }
        setScriptRegistry(prev => [...prev, entry])
        setActiveScriptId(entry.id)
        setScriptContent(content)
        setScriptPath(path)
        setScriptOriginal(content)
      }
    },
    onCronUpdated: () => {
      // AI 工具执行了 cron 写操作后自动刷新任务列表
      qc.invalidateQueries({ queryKey: ['cron'] })
      toast.success('定时任务列表已刷新')
    },
  })

  const [scriptContent, setScriptContent] = useState('')
  const [scriptPath, setScriptPath] = useState('')
  const [scriptOriginal, setScriptOriginal] = useState('')
  const [input, setInput] = useState('')

  const handleSavePrompt = useCallback(() => {
    if (editingPrompt.trim()) {
      localStorage.setItem(PROMPT_STORAGE_KEY, editingPrompt)
      toast.success('Prompt 已保存')
    } else {
      localStorage.removeItem(PROMPT_STORAGE_KEY)
      toast.success('已恢复默认 Prompt')
    }
  }, [editingPrompt])

  const handleResetPrompt = useCallback(() => {
    setEditingPrompt('')
    localStorage.removeItem(PROMPT_STORAGE_KEY)
    toast.success('已恢复默认 Prompt')
  }, [])

  // ── 对话历史 ──────────────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false)

  interface ConversationItem {
    id: string
    title: string
    updated_at: string
    message_count: number
    latest_run_status?: string
  }

  const { data: conversations = [] } = useQuery<ConversationItem[]>({
    queryKey: ['cron-conversations'],
    queryFn: async () => {
      const { data } = await client.get('/api/agents/conversations', { params: { page_context: 'cron' } })
      return Array.isArray(data) ? data : []
    },
    refetchInterval: 30_000,
  })

  // 挂载时恢复上次对话
  const hasRestoredRef = useRef(false)
  useEffect(() => {
    if (hasRestoredRef.current) return
    hasRestoredRef.current = true
    const savedId = sessionStorage.getItem(STORAGE_KEY)
    if (savedId && messages.length === 0) {
      handleLoadConversation(savedId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLoadConversation = useCallback(async (id: string) => {
    try {
      const { data } = await client.get(`/api/agents/conversations/${id}`)
      const serverMsgs = Array.isArray(data?.messages) ? data.messages : []
      const mapped: ScopedMessage[] = serverMsgs.map((m: { role: string; content: string; id?: string; tool?: string; args?: Record<string, unknown> }, i: number) => {
        const msg: ScopedMessage = {
          _id: `h_${i}_${Date.now()}`,
          role: (m.role as ScopedMessage['role']) ?? 'assistant',
          content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
          tool: m.tool,
          args: m.args,
        }
        // Re-parse spec/suggestions for assistant messages
        if (msg.role === 'assistant' && msg.content) {
          const spec = parseCronJobSpec(msg.content)
          const suggestions = parseSuggestions(msg.content)
          if (spec) msg.spec = spec
          if (suggestions) msg.suggestions = suggestions
        }
        return msg
      })
      loadConversation(id, mapped)
      // 恢复编辑器中最后一个脚本（优先 write_file 工具调用，其次 cron-job-spec）
      let restored = false
      for (let i = mapped.length - 1; i >= 0; i--) {
        const m = mapped[i]
        // 先检查 write_file 工具调用
        if (m.role === 'tool_call' && m.tool === 'write_file' && m.args) {
          const fp = (m.args.file_path ?? m.args.path ?? '') as string
          const fc = (m.args.content ?? '') as string
          if (fp && fc) {
            setScriptContent(fc)
            setScriptPath(fp)
            setScriptOriginal(fc)
            restored = true
            break
          }
        }
        // 再检查 cron-job-spec
        if (!restored && m.spec?.script_content) {
          setScriptContent(m.spec.script_content)
          setScriptPath(m.spec.script_path ?? m.spec.command ?? '')
          setScriptOriginal(m.spec.script_content)
          restored = true
          break
        }
      }
      setShowHistory(false)
    } catch {
      toast.error('加载对话失败')
    }
  }, [loadConversation])

  const handleNewConversation = useCallback(() => {
    clearMessages()
    setScriptContent('')
    setScriptPath('')
    setScriptOriginal('')
    setScriptRegistry([])
    setActiveScriptId(null)
    setShowHistory(false)
    qc.invalidateQueries({ queryKey: ['cron-conversations'] })
  }, [clearMessages, qc])

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 流结束后刷新对话列表
  const prevStreamingRef = useRef(isStreaming)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      qc.invalidateQueries({ queryKey: ['cron-conversations'] })
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, qc])

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

  const handleSendSelectionToAI = useCallback((selectedText: string) => {
    const quoted = `请修改以下代码片段：\n\`\`\`bash\n${selectedText}\n\`\`\``
    setInput(quoted)
  }, [])

  const handleWriteToServer = useCallback(async (content: string) => {
    if (!scriptPath) { toast.error('未指定脚本路径'); return }
    const resolvedPath = scriptPath.replace(/^~/, `/home/${currentUsername}`)
    await client.put('/api/files/write', { path: resolvedPath, content })
    toast.success(`脚本已写入: ${scriptPath}`)
  }, [scriptPath, currentUsername])

  const handleCronAction = useCallback((action: string, contextMessage: string) => {
    if (action === 'insert') {
      // Insert action is handled by CronJobSpecCard directly
      return
    }
    if (contextMessage) {
      sendMessage(contextMessage)
    }
  }, [sendMessage])

  const handleTemplateSelect = useCallback((template: { description: string; promptInstructions: string }) => {
    // Template instructions are injected by updating the editing prompt
    setEditingPrompt(prev => {
      const base = prev || defaultPrompt
      return base + '\n\n## 当前模板要求\n' + template.promptInstructions
    })
    // Auto-send the template request
    sendMessage(`请根据以下需求生成脚本: ${template.description}`)
  }, [defaultPrompt, sendMessage])

  const handleScriptLinkClick = useCallback((entry: ScriptRegistryEntry) => {
    setActiveScriptId(entry.id)
    setScriptContent(entry.content)
    setScriptPath(entry.path)
    setScriptOriginal(entry.content)
  }, [])

  // ── 从 messages 中收集 write_file 工具调用，关联到最近的 assistant 消息 ──
  const writeFileByAssistant = (() => {
    const map = new Map<number, { filePath: string; content: string }[]>()
    let pending: { filePath: string; content: string }[] = []
    messages.forEach((msg, idx) => {
      if (msg.role === 'tool_call' && msg.tool === 'write_file' && msg.args) {
        const fp = (msg.args.file_path ?? msg.args.path ?? '') as string
        const fc = (msg.args.content ?? '') as string
        if (fp && fc) pending.push({ filePath: fp, content: fc })
      }
      if (msg.role === 'assistant' && pending.length > 0) {
        map.set(idx, [...pending])
        pending = []
      }
    })
    // 还有未关联的 pending → 附到最后一个 assistant 消息
    if (pending.length > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          const existing = map.get(i) ?? []
          map.set(i, [...existing, ...pending])
          break
        }
      }
    }
    return map
  })()

  // ── 收集所有生成的脚本（供 ScriptFileTree 显示） ──
  const generatedFiles = messages
    .filter(m => m.role === 'tool_call' && m.tool === 'write_file' && m.args)
    .map(m => ({
      name: ((m.args!.file_path ?? m.args!.path ?? '') as string).split('/').pop() ?? '',
      path: (m.args!.file_path ?? m.args!.path ?? '') as string,
      content: (m.args!.content ?? '') as string,
    }))
    .filter(f => f.path && f.name)

  return (
    <div className="flex flex-col h-full border-l border-border min-w-0">
      {/* Panel header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-border flex-shrink-0"
        style={{ background: 'var(--bg2-raw)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))' }}
      >
        <span className="text-sm">🤖</span>
        <span className="text-[13px] font-semibold text-text flex-1">Cron AI 助手</span>
        <span className="text-[10px] text-text3 bg-card px-2 py-0.5 rounded">{existingJobs.length} 个现有任务</span>
        <button
          onClick={() => setShowHistory(v => !v)}
          className={cn(
            'text-[10px] px-2 py-0.5 rounded transition-colors font-medium',
            showHistory ? 'bg-accent/15 text-accent' : 'text-text3 hover:text-text hover:bg-card',
          )}
          title="对话历史"
        >
          历史 {conversations.length > 0 && `(${conversations.length})`}
        </button>
        <button
          onClick={handleNewConversation}
          className="text-[10px] text-text3 hover:text-text px-2 py-0.5 rounded hover:bg-card font-medium"
          title="新对话"
        >
          + 新对话
        </button>
        <button
          onClick={() => setShowPromptEditor(v => !v)}
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded transition-colors',
            showPromptEditor ? 'bg-accent/15 text-accent' : 'text-text3 hover:text-text hover:bg-card',
          )}
          title="配置系统 Prompt"
        >
          ⚙️
        </button>
        <button
          onClick={onClose}
          className="text-text3 hover:text-text ml-1 text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-card"
        >
          ✕
        </button>
      </div>

      {/* Prompt 配置面板（可折叠） */}
      {showPromptEditor && (
        <div className="border-b border-border flex-shrink-0 bg-bg2/50">
          <div className="px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-text2">系统 Prompt 配置</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleResetPrompt}
                  className="text-[10px] text-text3 hover:text-text px-2 py-0.5 rounded border border-border hover:border-border-light transition-colors"
                >
                  恢复默认
                </button>
                <button
                  onClick={handleSavePrompt}
                  className="text-[10px] font-semibold bg-accent text-[#0f172a] px-2 py-0.5 rounded hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
              </div>
            </div>
            <textarea
              value={editingPrompt || defaultPrompt}
              onChange={e => setEditingPrompt(e.target.value)}
              rows={8}
              className="w-full resize-y glass rounded-md px-2.5 py-2 text-[11px] font-mono text-text2 leading-relaxed focus:border-accent/50 focus:outline-none"
              placeholder="输入自定义 Prompt，留空则使用默认..."
            />
            <div className="text-[9px] text-text3 mt-1">
              {editingPrompt.trim() ? '✏️ 使用自定义 Prompt' : '📋 使用默认 Prompt'} · 保存后对新对话生效
            </div>
          </div>
        </div>
      )}

      {/* Main content: chat + script preview (resizable) */}
      <ResizablePanelGroup className="flex-1 min-h-0">
        {/* Chat area */}
        <ResizablePanel defaultSize={42} minSize={25}>
        <div className="flex h-full border-r border-border">
          {/* 对话历史侧边栏 */}
          {showHistory && (
            <div className="flex flex-col h-full border-r border-border bg-bg2/50" style={{ width: 200, minWidth: 200 }}>
              <div className="px-2.5 py-2 border-b border-border flex items-center gap-1.5">
                <span className="text-[10px]">📋</span>
                <span className="text-[11px] font-semibold text-text2 flex-1">对话历史</span>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-text3 hover:text-text text-[10px] w-5 h-5 flex items-center justify-center rounded hover:bg-card"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {conversations.length === 0 ? (
                  <div className="px-3 py-6 text-[11px] text-text3 text-center">暂无历史对话</div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleLoadConversation(conv.id)}
                      className={cn(
                        'w-full text-left px-2.5 py-2 hover:bg-card/50 transition-colors border-b border-border/50',
                        conv.id === conversationId ? 'bg-accent/10 border-l-2 border-l-accent' : '',
                      )}
                    >
                      <div className="text-[11px] text-text truncate">{conv.title || '新对话'}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-text3">
                          {new Date(conv.updated_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {conv.message_count > 0 && (
                          <span className="text-[9px] text-text3">{conv.message_count} 条</span>
                        )}
                        {conv.latest_run_status && (
                          <span className={cn(
                            'text-[9px]',
                            conv.latest_run_status === 'completed' ? 'text-green' : conv.latest_run_status === 'error' ? 'text-red' : 'text-text3',
                          )}>
                            {conv.latest_run_status === 'completed' ? '✓' : conv.latest_run_status === 'error' ? '✗' : '⋯'}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Chat messages column */}
          <div className="flex flex-col h-full flex-1 min-w-0">

          {/* Todo 进度面板 */}
          {todos.length > 0 && (
            <div className="px-3 py-2 border-b border-border flex-shrink-0 bg-bg2/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px]">📋</span>
                <span className="text-[10px] font-semibold text-text2">
                  任务进度 {todos.filter(t => t.status === 'completed').length}/{todos.length}
                </span>
                {isStreaming && todos.some(t => t.status === 'in_progress') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                )}
              </div>
              <div className="h-1.5 bg-border/50 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-accent/70 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.round((todos.filter(t => t.status === 'completed').length / todos.length) * 100)}%` }}
                />
              </div>
              <div className="space-y-0.5">
                {todos.map((t) => (
                  <div key={t.id} className="flex items-center gap-1.5 text-[10px]">
                    <span className={cn(
                      t.status === 'completed' ? 'text-green' : t.status === 'in_progress' ? 'text-accent' : 'text-text3',
                    )}>
                      {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '⠋' : '○'}
                    </span>
                    <span className={cn(
                      'truncate',
                      t.status === 'completed' ? 'text-text3 line-through' : 'text-text2',
                    )}>{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="px-2 py-4">
                <div className="text-center mb-4">
                  <div className="text-2xl mb-2">🤖</div>
                  <div className="text-[12px] text-text3">描述你需要的定时任务</div>
                  <div className="text-[11px] mt-1 text-text3/60">或选择一个模板快速开始</div>
                </div>
                <ScriptTemplateSelector
                  onSelectTemplate={handleTemplateSelect}
                  onManageTemplates={() => setShowTemplateManager(true)}
                />
              </div>
            )}
            {messages.map((msg, msgIndex) => {
              // tool_result always hidden
              if (msg.role === 'tool_result') return null
              // tool_call rendering
              if (msg.role === 'tool_call') {
                const toolName = msg.tool ?? 'unknown'

                // ── Approval card ──
                if (toolName === '__approval__') {
                  const aId = msg.args?.approval_id as string
                  const aToolName = msg.args?.tool_name as string
                  const aRisk = msg.args?.risk_level as string
                  return (
                    <div key={msg._id} className="flex justify-start animate-in fade-in slide-in-from-left-2 duration-300">
                      <div className="max-w-[92%] glass rounded-xl p-3 border border-yellow/30 bg-yellow/5">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">⚠️</span>
                          <span className="text-[12px] font-semibold text-yellow">需要审批</span>
                          {aRisk && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow/15 text-yellow">{aRisk}</span>}
                        </div>
                        <div className="text-[11px] text-text2 mb-2">
                          {msg.content || `工具 ${aToolName} 需要您的授权`}
                        </div>
                        {aToolName && <div className="text-[10px] text-text3 font-mono mb-3">{aToolName}</div>}
                        {pendingApproval?.approval_id === aId ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => resolveApproval(aId, 'approve')}
                              className="text-[11px] font-semibold bg-green/20 text-green px-3 py-1.5 rounded-lg hover:bg-green/30 transition-colors"
                            >
                              ✓ 批准
                            </button>
                            <button
                              onClick={() => resolveApproval(aId, 'reject')}
                              className="text-[11px] font-semibold bg-red/20 text-red px-3 py-1.5 rounded-lg hover:bg-red/30 transition-colors"
                            >
                              ✗ 拒绝
                            </button>
                          </div>
                        ) : (
                          <div className="text-[10px] text-text3">已处理</div>
                        )}
                      </div>
                    </div>
                  )
                }

                // ── During streaming: show tool activity ──
                if (isStreaming) {
                  const tcData = activeToolCalls.find(tc => tc.id === msg._serverId)
                  const isCompleted = tcData?.completed ?? false

                  if (toolName === 'write_file') {
                    const fp = ((msg.args?.file_path ?? msg.args?.path ?? '') as string).split('/').pop()
                    return (
                      <div key={msg._id} className="flex justify-start animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="flex items-center gap-2 text-[11px] px-3 py-1.5 glass rounded-lg">
                          <span className={isCompleted ? 'text-green' : 'text-accent animate-pulse'}>
                            {isCompleted ? '✓' : '✎'}
                          </span>
                          <span className={isCompleted ? 'text-text3' : 'text-text2'}>
                            {isCompleted ? 'Wrote' : 'Writing'} <span className="font-mono">{fp}</span>
                          </span>
                        </div>
                      </div>
                    )
                  }

                  // Generic tool call display
                  const displayName = toolName.replace(/_/g, ' ')
                  return (
                    <div key={msg._id} className="flex justify-start animate-in fade-in slide-in-from-left-2 duration-300">
                      <div className="flex items-center gap-2 text-[11px] px-3 py-1.5 glass rounded-lg">
                        {isCompleted ? (
                          <span className="text-green">✓</span>
                        ) : (
                          <span className="text-accent animate-spin inline-block" style={{ animationDuration: '1.5s' }}>⠋</span>
                        )}
                        <span className={cn('capitalize', isCompleted ? 'text-text3' : 'text-text2')}>
                          {displayName}
                        </span>
                        {msg.args && !isCompleted && (() => {
                          // Show brief args preview for select tools
                          if (toolName === 'read_file' || toolName === 'edit_file') {
                            const fp = ((msg.args.file_path ?? msg.args.path ?? '') as string).split('/').pop()
                            if (fp) return <span className="text-text3 font-mono text-[10px] truncate max-w-[120px]">{fp}</span>
                          }
                          if (toolName === 'execute' || toolName === 'run_shell' || toolName === 'run_shell_command') {
                            const cmd = (msg.args.command ?? msg.args.cmd ?? '') as string
                            if (cmd) return <span className="text-text3 font-mono text-[10px] truncate max-w-[150px]">{cmd.slice(0, 40)}</span>
                          }
                          return null
                        })()}
                      </div>
                    </div>
                  )
                }

                // ── After streaming: hide (write_file shown as ScriptLinkBlock in assistant message) ──
                return null
              }

              // Get write_file data associated with this assistant message
              const attachedFiles = msg.role === 'assistant' ? writeFileByAssistant.get(msgIndex) : undefined

              return (
                <div key={msg._id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[92%] space-y-1.5">
                    {msg.role === 'user' ? (
                      <div className="px-3 py-2 rounded-xl text-[12px] leading-relaxed bg-accent/15 border border-accent/25 text-text rounded-br-sm">
                        {msg.content}
                      </div>
                    ) : (
                      <>
                        {/* Assistant text — render with MarkdownContent, stripping cron-job-spec and suggestions blocks */}
                        {(() => {
                          const textOnly = msg.content
                            .replace(/```cron-job-spec[\s\S]*?```/g, '')
                            .replace(/```suggestions[\s\S]*?```/g, '')
                            .trim()
                          if (!textOnly && (msg.spec || msg.suggestions || (attachedFiles && attachedFiles.length > 0))) return null
                          return (
                            <div className="prose-sm text-[12px] leading-relaxed">
                              <MarkdownContent content={textOnly || msg.content} />
                              {msg.isStreaming && (
                                <span className="inline-block w-1 h-3 bg-accent/60 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                              )}
                            </div>
                          )
                        })()}

                        {/* Spec card + Action bar */}
                        {msg.spec && !msg.isStreaming && (
                          <>
                            <CronJobSpecCard
                              spec={msg.spec}
                              onEditScript={(content, path) => {
                                setScriptContent(content)
                                setScriptPath(path)
                                setScriptOriginal(content)
                              }}
                            />
                            <CronActionBar spec={msg.spec} onAction={handleCronAction} disabled={isStreaming} />
                          </>
                        )}

                        {/* Script link from spec (cron-job-spec block) */}
                        {msg.spec?.script_path && !msg.isStreaming && (
                          <ScriptLinkBlock
                            filePath={msg.spec.script_path}
                            firstLine={msg.spec.script_content?.split('\n').find(l => l.trim() && !l.startsWith('#!')) ?? ''}
                            lineCount={msg.spec.script_content?.split('\n').length ?? 0}
                            timestamp={Date.now()}
                            isActive={scriptPath === msg.spec.script_path}
                            onClick={() => {
                              if (msg.spec?.script_content) {
                                setScriptContent(msg.spec.script_content)
                                setScriptPath(msg.spec.script_path ?? msg.spec.command ?? '')
                                setScriptOriginal(msg.spec.script_content)
                              }
                            }}
                          />
                        )}

                        {/* Script links from write_file tool calls */}
                        {attachedFiles && !msg.isStreaming && attachedFiles.map(wf => {
                          const lines = wf.content.split('\n')
                          // Skip if same path as spec (avoid duplicate)
                          if (msg.spec?.script_path === wf.filePath) return null
                          return (
                            <ScriptLinkBlock
                              key={wf.filePath}
                              filePath={wf.filePath}
                              firstLine={lines.find(l => l.trim() && !l.startsWith('#!')) ?? ''}
                              lineCount={lines.length}
                              timestamp={Date.now()}
                              isActive={scriptPath === wf.filePath}
                              onClick={() => {
                                setScriptContent(wf.content)
                                setScriptPath(wf.filePath)
                                setScriptOriginal(wf.content)
                              }}
                            />
                          )
                        })}

                        {/* Suggestion chips */}
                        {msg.suggestions && msg.suggestions.length > 0 && !msg.isStreaming && (
                          <SuggestionChips
                            suggestions={msg.suggestions}
                            onSelect={(text) => sendMessage(text)}
                            disabled={isStreaming}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            {/* Streaming activity indicator — thinking dots + tool progress */}
            {isStreaming && messages.length > 0 && (() => {
              const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
              const showThinking = lastAssistant && !lastAssistant.content && lastAssistant.isStreaming
              const activeCount = activeToolCalls.filter(tc => !tc.completed).length
              if (!showThinking && activeCount === 0 && totalToolCount === 0) return null
              return (
                <div className="flex justify-start animate-in fade-in duration-500">
                  <div className="glass rounded-xl px-3 py-2 space-y-1">
                    {/* Thinking dots */}
                    {showThinking && (
                      <div className="flex items-center gap-2.5">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-[11px] text-text3">AI 正在思考...</span>
                      </div>
                    )}
                    {/* Tool progress bar */}
                    {totalToolCount > 0 && (
                      <div className="flex items-center gap-2 text-[10px] text-text3">
                        <span className="tabular-nums">{completedToolCount}/{totalToolCount} 工具已完成</span>
                        {activeCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
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
        </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Script preview area */}
        <ResizablePanel defaultSize={58} minSize={30}>
          <div className="flex h-full min-w-0">
            {/* Mini file tree */}
            <ScriptFileTree
              currentFilePath={scriptPath}
              generatedFiles={generatedFiles}
              onSelectFile={(path, content) => {
                setScriptPath(path)
                if (content) {
                  setScriptOriginal(content)
                  setScriptContent(content)
                }
              }}
            />
            {/* Script editor */}
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
                  <div className="text-[12px] text-center">AI 生成脚本后将在此预览</div>
                  <div className="text-[11px] mt-1 text-text3/60 text-center">或从左侧目录选择已有脚本</div>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
