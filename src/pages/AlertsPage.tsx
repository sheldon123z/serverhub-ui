/**
 * 告警管理页 — 统计面板 + 活跃告警(批量操作) + 历史记录 + 详情抽屉 + CSV导出 + AI分析入口
 */

import { useState, useMemo, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, RefreshCw, Download, CheckCheck } from 'lucide-react'
import client from '@/api/client'
import toast from 'react-hot-toast'
import { cn, formatDate } from '@/lib/utils'
import { SeverityBadge, StatusBadge } from '@/components/alerts/shared'
import type { AlertHistory } from '@/components/alerts/shared'
import AlertDetailDrawer from '@/components/alerts/AlertDetailDrawer'
import AlertStats from '@/components/alerts/AlertStats'

const AlertRulesPage = lazy(() => import('./AlertRulesPage'))

type TabKey = 'active' | 'history' | 'rules' | 'stats'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: '活跃告警' },
  { key: 'history', label: '历史记录' },
  { key: 'rules', label: '告警规则' },
  { key: 'stats', label: '统计分析' },
]

/* ── CSV 导出 ── */
function exportCSV(items: AlertHistory[]) {
  const header = 'ID,规则,严重度,状态,消息,触发时间,恢复时间,服务器\n'
  const rows = items
    .map((a) =>
      [
        a.id,
        a.rule_name ?? '',
        a.severity,
        a.status,
        `"${(a.message ?? '').replace(/"/g, '""')}"`,
        a.fired_at,
        a.resolved_at ?? '',
        a.server_id,
      ].join(','),
    )
    .join('\n')
  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `alerts-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AlertsPage() {
  const [tab, setTab] = useState<TabKey>('active')
  const [severity, setSeverity] = useState<string>('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [drawerAlert, setDrawerAlert] = useState<AlertHistory | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  /* ── 数据查询 ── */
  const { data: activeData, isFetching: activeFetching, refetch: refetchActive } = useQuery({
    queryKey: ['alerts-active'],
    queryFn: async () => {
      const res = await client.get('/api/alerts/active', { params: { limit: 100 } })
      return res.data as { alerts: AlertHistory[]; count: number }
    },
    refetchInterval: 30_000,
  })

  const { data: historyData, isFetching: histFetching, refetch: refetchHistory } = useQuery({
    queryKey: ['alerts-history', severity],
    queryFn: async () => {
      const res = await client.get('/api/alerts/history', {
        params: { limit: 100, ...(severity ? { severity } : {}) },
      })
      return res.data as { items: AlertHistory[]; total: number }
    },
    enabled: tab === 'history' || tab === 'stats',
  })

  const activeAlerts = activeData?.alerts ?? []
  const historyItems = historyData?.items ?? []

  /* ── 统计数据 ── */
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const todayAlerts = activeAlerts.filter((a) => a.fired_at?.startsWith(today))
    const resolved = (historyData?.items ?? []).filter((a) => a.resolved_at)
    const avgMin =
      resolved.length > 0
        ? Math.round(
            resolved.reduce(
              (sum, a) =>
                sum + (new Date(a.resolved_at!).getTime() - new Date(a.fired_at).getTime()) / 60000,
              0,
            ) / resolved.length,
          )
        : null
    const bySev = { critical: 0, warning: 0, info: 0 }
    for (const a of activeAlerts) {
      if (a.severity in bySev) bySev[a.severity as keyof typeof bySev]++
    }
    return {
      activeCount: activeAlerts.length,
      todayCount: todayAlerts.length,
      avgResolutionMin: avgMin,
      bySeverity: bySev,
    }
  }, [activeAlerts, historyData])

  /* ── 单条确认 ── */
  const ackMutation = useMutation({
    mutationFn: (id: number) => client.put(`/api/alerts/${id}/acknowledge`),
    onSuccess: () => {
      toast.success('告警已确认')
      qc.invalidateQueries({ queryKey: ['alerts-active'] })
    },
    onError: () => toast.error('确认失败'),
  })

  /* ── 批量确认 ── */
  const batchAckMut = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => client.put(`/api/alerts/${id}/acknowledge`))),
    onSuccess: () => {
      toast.success(`已确认 ${selected.size} 条告警`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['alerts-active'] })
    },
    onError: () => toast.error('批量确认失败'),
  })

  /* ── 批量选择 ── */
  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === activeAlerts.length) setSelected(new Set())
    else setSelected(new Set(activeAlerts.map((a) => a.id)))
  }

  /* ── AI 分析跳转 ── */
  function handleAIAnalyze(alert: AlertHistory) {
    const msg = `请分析以下告警并给出排查建议：\n\n规则: ${alert.rule_name ?? alert.rule_id}\n严重度: ${alert.severity}\n消息: ${alert.message}\n触发时间: ${alert.fired_at}\n服务器: ${alert.server_id}${alert.value !== null ? `\n触发值: ${alert.value}` : ''}`
    sessionStorage.setItem('serverhub-chat-draft', msg)
    navigate('/agents')
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell size={20} className="text-accent" />
          <h1 className="text-xl font-semibold text-text">告警管理</h1>
          {activeAlerts.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red/20 text-red text-xs font-bold">
              {activeAlerts.length} 活跃
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 批量确认 */}
          {selected.size > 0 && (
            <button
              onClick={() => batchAckMut.mutate([...selected])}
              disabled={batchAckMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent/15 text-accent hover:bg-accent/25 rounded-lg transition-colors"
            >
              <CheckCheck size={14} />
              确认 {selected.size} 条
            </button>
          )}
          {/* 导出 CSV */}
          <button
            onClick={() => exportCSV(tab === 'active' ? activeAlerts : historyItems)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text3 hover:text-text border border-border rounded-lg transition-colors"
          >
            <Download size={14} />
            导出 CSV
          </button>
          {/* 刷新 */}
          <button
            onClick={() => {
              refetchActive()
              refetchHistory()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text3 hover:text-text border border-border rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={activeFetching || histFetching ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {/* 统计面板 */}
      <AlertStats
        activeCount={stats.activeCount}
        todayCount={stats.todayCount}
        avgResolutionMin={stats.avgResolutionMin}
        bySeverity={stats.bySeverity}
      />

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-accent text-accent' : 'border-transparent text-text3 hover:text-text',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Active Alerts */}
      {tab === 'active' && (
        <div>
          {activeAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text3">
              <CheckCircle size={48} className="text-green mb-3 opacity-50" />
              <p className="text-sm">当前无活跃告警</p>
            </div>
          ) : (
            <div className="glass rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg text-text3 text-xs">
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === activeAlerts.length && activeAlerts.length > 0}
                        onChange={toggleSelectAll}
                        className="accent-accent"
                      />
                    </th>
                    <th className="text-left p-3 w-36">触发时间</th>
                    <th className="text-left p-3 w-24">严重度</th>
                    <th className="text-left p-3">规则</th>
                    <th className="text-left p-3">消息</th>
                    <th className="text-left p-3 w-20">服务器</th>
                    <th className="text-left p-3 w-24">确认人</th>
                    <th className="text-right p-3 w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAlerts.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-border/30 hover:bg-card-hover transition-colors cursor-pointer"
                      onClick={() => setDrawerAlert(a)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(a.id)}
                          onChange={() => toggleSelect(a.id)}
                          className="accent-accent"
                        />
                      </td>
                      <td className="p-3 text-text3 text-xs whitespace-nowrap">{formatDate(a.fired_at)}</td>
                      <td className="p-3">
                        <SeverityBadge severity={a.severity ?? 'info'} />
                      </td>
                      <td className="p-3 text-text2 font-medium text-xs">{a.rule_name ?? a.rule_id ?? '—'}</td>
                      <td className="p-3 text-text3 text-xs truncate max-w-xs" title={a.message ?? ''}>
                        {a.message ?? '—'}
                      </td>
                      <td className="p-3 text-text3 text-xs">{a.server_id}</td>
                      <td className="p-3 text-text3 text-xs">
                        {a.acknowledged_by ?? <span className="text-text3/40">未确认</span>}
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {!a.acknowledged_by && (
                          <button
                            onClick={() => ackMutation.mutate(a.id)}
                            disabled={ackMutation.isPending}
                            className="px-2 py-1 text-xs bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors"
                          >
                            确认
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2">
            {['', 'critical', 'warning', 'info'].map((s) => (
              <button
                key={s || 'all'}
                onClick={() => setSeverity(s)}
                className={cn(
                  'px-3 py-1 text-xs rounded-full border transition-colors',
                  severity === s
                    ? 'bg-accent text-white border-accent'
                    : 'border-border text-text3 hover:border-accent hover:text-accent',
                )}
              >
                {s || '全部'}
              </button>
            ))}
          </div>

          <div className="glass rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg text-text3 text-xs">
                  <th className="text-left p-3 w-36">触发时间</th>
                  <th className="text-left p-3 w-24">严重度</th>
                  <th className="text-left p-3 w-20">状态</th>
                  <th className="text-left p-3">规则</th>
                  <th className="text-left p-3">消息</th>
                  <th className="text-left p-3 w-36">恢复时间</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-text3 text-sm">
                      暂无历史记录
                    </td>
                  </tr>
                ) : (
                  historyItems.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-border/30 hover:bg-card-hover transition-colors cursor-pointer"
                      onClick={() => setDrawerAlert(a)}
                    >
                      <td className="p-3 text-text3 text-xs whitespace-nowrap">{formatDate(a.fired_at)}</td>
                      <td className="p-3">
                        <SeverityBadge severity={a.severity ?? 'info'} />
                      </td>
                      <td className="p-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="p-3 text-text2 font-medium text-xs">{a.rule_name ?? a.rule_id ?? '—'}</td>
                      <td className="p-3 text-text3 text-xs truncate max-w-xs">{a.message ?? '—'}</td>
                      <td className="p-3 text-text3 text-xs whitespace-nowrap">
                        {a.resolved_at ? formatDate(a.resolved_at) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {historyData && <p className="text-xs text-text3">共 {historyData.total} 条记录</p>}
        </div>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <Suspense fallback={<div className="text-text3 text-sm py-8 text-center">加载中...</div>}>
          <AlertRulesPage embedded />
        </Suspense>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && (
        <div className="space-y-6">
          <h3 className="text-base font-semibold text-text">统计分析</h3>
          <AlertStats
            activeCount={stats.activeCount}
            todayCount={stats.todayCount}
            avgResolutionMin={stats.avgResolutionMin}
            bySeverity={stats.bySeverity}
          />
          <div className="glass rounded-lg p-4">
            <p className="text-sm text-text2">
              共 {historyData?.total ?? 0} 条历史告警记录，
              其中已恢复 {(historyData?.items ?? []).filter(a => a.resolved_at).length} 条
            </p>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      <AlertDetailDrawer alert={drawerAlert} onClose={() => setDrawerAlert(null)} onAnalyze={handleAIAnalyze} />
    </div>
  )
}
