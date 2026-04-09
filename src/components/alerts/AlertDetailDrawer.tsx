/**
 * 告警详情抽屉 — 点击告警行从右侧滑出
 */

import { X, Clock, AlertTriangle, Server, User, MessageSquare, Brain, Download, Hash } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import { SeverityBadge, StatusBadge } from './shared'
import type { AlertHistory } from './shared'

interface AlertDetailDrawerProps {
  alert: AlertHistory | null
  onClose: () => void
  onAnalyze?: (alert: AlertHistory) => void
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-text3 mt-0.5 shrink-0">{icon}</span>
      <div>
        <div className="text-xs text-text3 mb-0.5">{label}</div>
        <div className="text-sm text-text break-all">{value}</div>
      </div>
    </div>
  )
}

function exportAlertJSON(alert: AlertHistory) {
  const blob = new Blob([JSON.stringify(alert, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `alert-${alert.id}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function calcDuration(fired: string, resolved: string | null): string {
  const start = new Date(fired).getTime()
  const end = resolved ? new Date(resolved).getTime() : Date.now()
  const diffMs = end - start
  if (diffMs < 0) return '-'
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins} 分钟`
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  if (hours < 24) return `${hours} 小时 ${remainMins} 分钟`
  const days = Math.floor(hours / 24)
  return `${days} 天 ${hours % 24} 小时`
}

export default function AlertDetailDrawer({ alert, onClose, onAnalyze }: AlertDetailDrawerProps) {
  if (!alert) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-[480px] max-w-full h-full bg-bg2 border-l border-border overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 bg-bg2 border-b border-border">
          <h2 className="text-base font-semibold text-text">告警详情</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-card-hover text-text3 hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5">
          {/* Badges */}
          <div className="flex items-center gap-2">
            <SeverityBadge severity={alert.severity ?? 'info'} />
            <StatusBadge status={alert.status} />
          </div>

          {/* Info rows */}
          <div className="space-y-4">
            <InfoRow
              icon={<Hash size={14} />}
              label="告警 ID"
              value={String(alert.id)}
            />
            <InfoRow
              icon={<AlertTriangle size={14} />}
              label="规则名称"
              value={alert.rule_name ?? alert.rule_id ?? '-'}
            />
            <InfoRow
              icon={<MessageSquare size={14} />}
              label="告警消息"
              value={alert.message ?? '-'}
            />
            <InfoRow
              icon={<Server size={14} />}
              label="服务器"
              value={alert.server_id}
            />
            <InfoRow
              icon={<Clock size={14} />}
              label="触发时间"
              value={formatDate(alert.fired_at)}
            />
            <InfoRow
              icon={<Clock size={14} />}
              label="恢复时间"
              value={alert.resolved_at ? formatDate(alert.resolved_at) : '尚未恢复'}
            />
            <InfoRow
              icon={<Clock size={14} />}
              label="持续时间"
              value={calcDuration(alert.fired_at, alert.resolved_at)}
            />
            {alert.value !== null && (
              <InfoRow
                icon={<AlertTriangle size={14} />}
                label="触发值"
                value={String(alert.value)}
              />
            )}
            <InfoRow
              icon={<User size={14} />}
              label="确认人"
              value={alert.acknowledged_by ?? '未确认'}
            />
            {alert.acknowledged_at && (
              <InfoRow
                icon={<Clock size={14} />}
                label="确认时间"
                value={formatDate(alert.acknowledged_at)}
              />
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            {onAnalyze && (
              <button
                onClick={() => onAnalyze(alert)}
                className={cn(
                  'flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  'bg-accent/15 text-accent hover:bg-accent/25',
                )}
              >
                <Brain size={16} />
                让 AI 分析这条告警
              </button>
            )}
            <button
              onClick={() => exportAlertJSON(alert)}
              className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm text-text3 hover:text-text border border-border hover:border-text3/30 transition-colors"
            >
              <Download size={14} />
              导出 JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
