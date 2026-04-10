import { useState } from 'react'
import { cn } from '@/lib/utils'
import { pipelinesApi } from '@/api/pipelines'
import type { AIReviewResponse } from '@/api/pipelines'

interface AIReviewPanelProps {
  yamlContent: string
  onClose: () => void
}

export function AIReviewPanel({ yamlContent, onClose }: AIReviewPanelProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIReviewResponse['review'] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleReview = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await pipelinesApi.aiReview(yamlContent)
      setResult(res.data.review)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail ?? '审查失败')
    } finally {
      setLoading(false)
    }
  }

  // 首次打开时自动触发
  if (!result && !loading && !error) {
    handleReview()
  }

  const severityIcon = { error: '❌', warning: '⚠️', info: 'ℹ️' } as const

  return (
    <div className="flex h-full flex-col border-l border-border bg-bg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-text">
          <i className="ti ti-search mr-1" />
          AI 审查结果
        </span>
        <button type="button" onClick={onClose} className="text-text3 hover:text-text">
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-text3">
            <i className="ti ti-loader animate-spin" />
            AI 正在审查...
          </div>
        )}

        {error && <p className="text-xs text-red">{error}</p>}

        {result && (
          <div className="space-y-4">
            <div className="text-center">
              <span className={cn(
                'text-3xl font-bold',
                result.score >= 80 ? 'text-green' : result.score >= 60 ? 'text-amber-400' : 'text-red',
              )}>
                {result.score}
              </span>
              <span className="text-sm text-text3"> / 100</span>
            </div>

            {result.issues.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-text3 mb-2">问题 ({result.issues.length})</h4>
                <div className="space-y-1.5">
                  {result.issues.map((issue, i) => (
                    <div key={i} className="rounded border border-border bg-bg2 p-2 text-xs">
                      <span>{severityIcon[issue.severity as keyof typeof severityIcon] ?? '•'} </span>
                      <span className="text-text">{issue.message}</span>
                      {issue.step_id && <span className="ml-1 text-text3">({issue.step_id})</span>}
                      {issue.suggestion && <p className="mt-1 text-text3">→ {issue.suggestion}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.best_practices && result.best_practices.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-text3 mb-2">最佳实践</h4>
                <ul className="space-y-1 text-xs text-text2">
                  {result.best_practices.map((bp, i) => <li key={i}>{bp}</li>)}
                </ul>
              </div>
            )}

            <button type="button" onClick={handleReview} className="w-full rounded-lg border border-border py-2 text-xs text-text3 hover:bg-bg2">
              重新审查
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
