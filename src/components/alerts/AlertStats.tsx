/**
 * 告警统计卡片面板
 */

import { AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react'

interface AlertStatsProps {
  activeCount: number
  todayCount: number
  avgResolutionMin: number | null
  bySeverity: { critical: number; warning: number; info: number }
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  iconColor: string
}

function StatCard({ icon, label, value, iconColor }: StatCardProps) {
  return (
    <div className="glass rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={iconColor}>{icon}</span>
        <span className="text-xs text-text3">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text">{value}</div>
    </div>
  )
}

export default function AlertStats({ activeCount, todayCount, avgResolutionMin, bySeverity }: AlertStatsProps) {
  const severityText = [
    bySeverity.critical > 0 ? `${bySeverity.critical} 严重` : null,
    bySeverity.warning > 0 ? `${bySeverity.warning} 警告` : null,
    bySeverity.info > 0 ? `${bySeverity.info} 信息` : null,
  ]
    .filter(Boolean)
    .join(' / ') || '无'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon={<AlertTriangle size={16} />}
        label="活跃告警"
        value={activeCount}
        iconColor="text-red"
      />
      <StatCard
        icon={<TrendingUp size={16} />}
        label="今日新增"
        value={todayCount}
        iconColor="text-yellow"
      />
      <StatCard
        icon={<Clock size={16} />}
        label="平均恢复时间"
        value={avgResolutionMin !== null ? `${avgResolutionMin} 分钟` : '-'}
        iconColor="text-accent"
      />
      <StatCard
        icon={<CheckCircle size={16} />}
        label="严重度分布"
        value={severityText}
        iconColor="text-green"
      />
    </div>
  )
}
