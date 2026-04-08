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
  const match = content.match(/```cron-job-spec\r?\n([\s\S]+?)\r?\n```/m)
  if (!match) return null
  try {
    // Escape literal newlines inside JSON string values so JSON.parse succeeds
    const sanitized = match[1].replace(/("(?:[^"\\]|\\.)*")/g, (m) =>
      m.replace(/\n/g, '\\n').replace(/\r/g, '\\r')
    )
    const spec = JSON.parse(sanitized) as CronJobSpec
    if (!spec.schedule || !spec.command) return null
    return spec
  } catch (e) {
    console.warn('[parseCronJobSpec] JSON 解析失败:', e, '\n原始内容:', match[1])
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

// ─── V2 新增类型 ───

/** Scoped chat 消息（独立于全局 chatStore） */
export interface ScopedMessage {
  _id: string
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  tool?: string
  args?: Record<string, unknown>
  spec?: CronJobSpec
  suggestions?: string[]
  isStreaming?: boolean
  _serverId?: string
}

/** 脚本注册表条目（追踪对话中生成的所有脚本） */
export interface ScriptRegistryEntry {
  id: string
  path: string
  content: string
  messageId: string
  timestamp: number
  lineCount: number
}

/** 模板分类 */
export type TemplateCategory = 'backup' | 'monitoring' | 'cleanup' | 'security' | 'report' | 'custom'

/** 脚本模板 */
export interface ScriptTemplate {
  id: string
  name: string
  category: TemplateCategory
  description: string
  promptInstructions: string
  defaultSchedule?: string
  icon: string
  isBuiltin: boolean
}

/** 解析 agent 响应中的 ```suggestions 代码块 */
export function parseSuggestions(content: string): string[] | null {
  const match = content.match(/```suggestions\r?\n([\s\S]*?)\r?\n```/)
  if (!match) return null
  try {
    const arr = JSON.parse(match[1])
    if (Array.isArray(arr) && arr.every(item => typeof item === 'string') && arr.length > 0) {
      return arr
    }
    return null
  } catch {
    // Fallback: try parsing as newline-separated list
    const lines = match[1].split('\n').map(l => l.trim()).filter(Boolean)
    return lines.length > 0 ? lines : null
  }
}

/** 从文件扩展名推断语言 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    sh: 'bash', bash: 'bash', zsh: 'bash',
    py: 'python', python: 'python',
    js: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    java: 'java',
    json: 'json',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown', markdown: 'markdown',
    sql: 'sql',
    css: 'css',
    dockerfile: 'docker',
    conf: 'nginx',
  }
  return map[ext] ?? 'bash'
}
