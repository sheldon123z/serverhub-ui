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
