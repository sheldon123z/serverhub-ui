/**
 * 告警模块共享类型和 Badge 组件
 */

import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AlertHistory {
  id: number
  rule_id: string | null
  rule_name: string | null
  server_id: string
  status: string
  value: number | null
  message: string | null
  severity: string
  fired_at: string
  resolved_at: string | null
  acknowledged_by: string | null
  acknowledged_at: string | null
}

const SEVERITY_STYLES: Record<string, { badge: string; icon: React.ReactNode }> = {
  critical: { badge: 'bg-red/15 text-red border border-red/30', icon: <AlertTriangle size={12} /> },
  warning: { badge: 'bg-yellow/15 text-yellow border border-yellow/30', icon: <AlertTriangle size={12} /> },
  info: { badge: 'bg-accent/15 text-accent border border-accent/30', icon: <Info size={12} /> },
}

const STATUS_STYLES: Record<string, string> = {
  firing: 'bg-red/15 text-red',
  resolved: 'bg-green/15 text-green',
}

export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium', s.badge)}>
      {s.icon}
      {severity}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', STATUS_STYLES[status] ?? 'bg-text3/10 text-text3')}>
      {status === 'firing' ? '触发中' : status === 'resolved' ? '已恢复' : status}
    </span>
  )
}
