import { useState, useRef, useEffect, useCallback } from 'react'
import { useServerStore } from '@/stores/serverStore'
import client from '@/api/client'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { useScopedSSEChat } from '@/hooks/useScopedSSEChat'
import { type CronJobSpec, type ScriptRegistryEntry, parseSuggestions } from '@/types/cron-agent'
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
8. When providing optimization suggestions, output a \`suggestions\` code block:

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

  const { messages, isStreaming, sendMessage, clearMessages, cancelStreaming } = useScopedSSEChat({
    pageContext: activePrompt,
    onSpecDetected: (spec, messageId) => {
      if (spec.script_content && spec.script_path) {
        const entry: ScriptRegistryEntry = {
          id: `script_${Date.now()}`,
          path: spec.script_path,
          content: spec.script_content,
          messageId,
          timestamp: Date.now(),
          lineCount: spec.script_content.split('\n').length,
        }
        setScriptRegistry(prev => [...prev, entry])
        setActiveScriptId(entry.id)
        setScriptContent(spec.script_content)
        setScriptPath(spec.script_path)
        setScriptOriginal(spec.script_content)
      }
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

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
          onClick={() => setShowPromptEditor(v => !v)}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            showPromptEditor ? 'bg-accent/15 text-accent' : 'text-text3 hover:text-text hover:bg-card'
          }`}
          title="配置系统 Prompt"
        >
          ⚙️
        </button>
        <button
          onClick={clearMessages}
          className="text-[10px] text-text3 hover:text-text px-1.5 py-0.5 rounded hover:bg-card"
          title="清空对话"
        >
          清空
        </button>
        <button
          onClick={() => setShowTemplateManager(v => !v)}
          className="text-[10px] text-text3 hover:text-text px-1.5 py-0.5 rounded hover:bg-card"
          title="管理模板"
        >
          📋
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
        <div className="flex flex-col h-full border-r border-border">
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
            {messages.map(msg => {
              // Skip tool_call and tool_result messages
              if (msg.role === 'tool_call' || msg.role === 'tool_result') return null

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
                          if (!textOnly && (msg.spec || msg.suggestions)) return null
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

                        {/* Script link block */}
                        {msg.spec?.script_path && !msg.isStreaming && (
                          <ScriptLinkBlock
                            filePath={msg.spec.script_path}
                            firstLine={msg.spec.script_content?.split('\n').find(l => l.trim() && !l.startsWith('#!')) ?? ''}
                            lineCount={msg.spec.script_content?.split('\n').length ?? 0}
                            timestamp={Date.now()}
                            isActive={scriptRegistry.find(s => s.messageId === msg._id)?.id === activeScriptId}
                            onClick={() => {
                              const entry = scriptRegistry.find(s => s.messageId === msg._id)
                              if (entry) handleScriptLinkClick(entry)
                            }}
                          />
                        )}

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
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Script preview area */}
        <ResizablePanel defaultSize={58} minSize={30}>
          <div className="flex h-full min-w-0">
            {/* Mini file tree */}
            <ScriptFileTree
              currentFilePath={scriptPath}
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
