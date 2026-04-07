import type { ScriptTemplate } from '@/types/cron-agent'

export const BUILTIN_TEMPLATES: ScriptTemplate[] = [
  // ── 备份 ──
  {
    id: 'builtin-db-backup',
    name: 'PostgreSQL 数据库备份',
    category: 'backup',
    description: '自动备份 PostgreSQL 数据库，支持压缩和保留策略',
    icon: '🐘',
    defaultSchedule: '0 2 * * *',
    isBuiltin: true,
    promptInstructions: `生成一个 PostgreSQL 数据库备份脚本：
- 使用 pg_dump 导出指定数据库
- gzip 压缩备份文件
- 保留最近 7 天的备份，自动删除更早的
- 备份文件命名格式: db_YYYYMMDD_HHMMSS.sql.gz
- 保存到 ~/backups/postgres/ 目录
- 记录日志到 ~/logs/db-backup.log
- 失败时输出错误信息`,
  },
  {
    id: 'builtin-file-backup',
    name: '目录文件备份',
    category: 'backup',
    description: '使用 tar 打包压缩指定目录，支持增量备份',
    icon: '📁',
    defaultSchedule: '0 3 * * *',
    isBuiltin: true,
    promptInstructions: `生成一个目录备份脚本：
- 使用 tar + gzip 打包压缩指定目录
- 支持排除指定文件模式（如 node_modules, __pycache__）
- 保留最近 5 个备份
- 备份文件命名格式: backup_YYYYMMDD.tar.gz
- 保存到 ~/backups/files/ 目录
- 记录备份大小和耗时到日志`,
  },
  // ── 监控 ──
  {
    id: 'builtin-disk-monitor',
    name: '磁盘空间监控',
    category: 'monitoring',
    description: '监控磁盘使用率，超过阈值发送告警',
    icon: '💿',
    defaultSchedule: '*/30 * * * *',
    isBuiltin: true,
    promptInstructions: `生成一个磁盘空间监控脚本：
- 检查所有挂载点的磁盘使用率
- 阈值: 80% 警告, 90% 严重
- 超过阈值时输出告警信息（包含挂载点、使用率、剩余空间）
- 记录每次检查结果到 ~/logs/disk-monitor.log
- 只在状态变化时告警（避免重复告警）`,
  },
  {
    id: 'builtin-service-health',
    name: '服务健康检查',
    category: 'monitoring',
    description: '检查关键 systemd 服务状态，异常时告警',
    icon: '🏥',
    defaultSchedule: '*/5 * * * *',
    isBuiltin: true,
    promptInstructions: `生成一个服务健康检查脚本：
- 检查指定的 systemd 服务列表是否正在运行
- 默认检查: nginx, docker, mysql, server-hub
- 服务不在 active 状态时输出告警
- 尝试自动重启失败的服务（最多重试 1 次）
- 记录检查结果到 ~/logs/service-health.log`,
  },
  // ── 清理 ──
  {
    id: 'builtin-log-cleanup',
    name: '日志文件清理',
    category: 'cleanup',
    description: '清理指定天数前的日志文件，释放磁盘空间',
    icon: '📝',
    defaultSchedule: '0 4 * * *',
    isBuiltin: true,
    promptInstructions: `生成一个日志清理脚本：
- 清理 /var/log/ 和 ~/logs/ 下超过 30 天的日志文件
- 支持 .log, .gz, .old 后缀
- 清理前统计将释放的空间
- 排除重要的系统日志（如 auth.log 最近的）
- 记录清理结果（删除文件数、释放空间大小）到 ~/logs/cleanup.log`,
  },
  {
    id: 'builtin-docker-cleanup',
    name: 'Docker 资源清理',
    category: 'cleanup',
    description: '清理未使用的 Docker 镜像、容器和卷',
    icon: '🐳',
    defaultSchedule: '0 5 * * 0',
    isBuiltin: true,
    promptInstructions: `生成一个 Docker 资源清理脚本：
- 删除所有已停止的容器
- 删除所有未使用的（dangling）镜像
- 删除未使用的网络
- 可选：清理未使用的卷（需确认）
- 清理前后分别统计 Docker 磁盘使用情况
- 记录清理结果到 ~/logs/docker-cleanup.log`,
  },
  // ── 安全 ──
  {
    id: 'builtin-ssh-audit',
    name: 'SSH 登录审计',
    category: 'security',
    description: '分析 SSH 登录日志，检测异常登录行为',
    icon: '🔐',
    defaultSchedule: '0 8 * * *',
    isBuiltin: true,
    promptInstructions: `生成一个 SSH 登录审计脚本：
- 分析 /var/log/auth.log 中的 SSH 登录记录
- 统计: 成功登录次数、失败次数、来源 IP 分布
- 标记可疑行为: 短时间内多次失败、非常用 IP 登录
- 输出格式化的审计报告
- 记录到 ~/logs/ssh-audit.log`,
  },
  {
    id: 'builtin-permission-check',
    name: '文件权限检查',
    category: 'security',
    description: '扫描关键目录的文件权限，发现异常权限设置',
    icon: '🛡️',
    defaultSchedule: '0 6 * * 1',
    isBuiltin: true,
    promptInstructions: `生成一个文件权限检查脚本：
- 检查 /etc/, ~/.ssh/, ~/scripts/ 目录的文件权限
- 标记权限过于宽松的文件（如 777, 666）
- 检查 SUID/SGID 位设置的文件
- 检查 .ssh 目录权限是否正确 (700/600)
- 输出异常文件列表和修复建议
- 记录到 ~/logs/permission-check.log`,
  },
  // ── 报告 ──
  {
    id: 'builtin-daily-report',
    name: '系统日报',
    category: 'report',
    description: '生成每日系统状态汇总报告',
    icon: '📊',
    defaultSchedule: '0 8 * * *',
    isBuiltin: true,
    promptInstructions: `生成一个系统日报脚本：
- 收集: CPU 使用率、内存使用、磁盘使用、网络流量
- 统计: 最近 24 小时的 Top 10 进程（按 CPU/内存）
- 检查: systemd 服务状态、Docker 容器状态
- 输出格式化的日报（包含表格和摘要）
- 支持输出到文件 ~/reports/daily/report_YYYYMMDD.txt`,
  },
  {
    id: 'builtin-weekly-report',
    name: '资源使用周报',
    category: 'report',
    description: '汇总一周的资源使用趋势和异常事件',
    icon: '📈',
    defaultSchedule: '0 9 * * 1',
    isBuiltin: true,
    promptInstructions: `生成一个资源使用周报脚本：
- 汇总过去 7 天的系统资源使用数据
- 计算: CPU/内存/磁盘的平均值、峰值、趋势
- 列出本周的异常事件（服务重启、磁盘告警等）
- 对比上周数据，标注显著变化
- 输出格式化周报到 ~/reports/weekly/report_YYYYWW.txt`,
  },
]
