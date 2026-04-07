import { useState, useRef, useEffect, useCallback } from 'react'
import { useServerStore } from '@/stores/serverStore'
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

function buildPageContext(username: string, jobs: ExistingJob[]): string {
  const jobSummary = jobs.slice(0, 10).map(j =>
    `  - ${j.schedule} | ${j.command}${j.comment ? ` # ${j.comment}` : ''}`
  ).join('\n')

  return `你是 ServerHub 服务器管理系统的定时任务助手。
当前用户: ${username}

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
  void useServerStore(s => s.selectedServerId)
  const pageContext = buildPageContext(currentUsername, existingJobs)

  const { messages, isStreaming, sendMessage, clearMessages, cancelStreaming } = useLightweightChat({ pageContext })

  const [scriptContent, setScriptContent] = useState('')
  const [scriptPath, setScriptPath] = useState('')
  const [scriptOriginal, setScriptOriginal] = useState('')
  const [input, setInput] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // When AI returns a spec with script content, auto-update preview
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
                <div className="max-w-[88%] space-y-2">
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
              <div className="text-[12px] text-center">AI 生成脚本后将在此预览</div>
              <div className="text-[11px] mt-1 text-text3/60 text-center">可直接编辑，选中代码可发给 AI 修改</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
