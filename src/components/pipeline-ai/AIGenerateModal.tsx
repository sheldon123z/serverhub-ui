import { useState } from 'react'
import { cn } from '@/lib/utils'
import { pipelinesApi } from '@/api/pipelines'
import type { AIGenerateResponse } from '@/api/pipelines'

interface AIGenerateModalProps {
  onClose: () => void
  onApply: (yaml: string) => void
}

export function AIGenerateModal({ onClose, onApply }: AIGenerateModalProps) {
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIGenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await pipelinesApi.aiGenerate(description.trim())
      setResult(res.data)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail ?? '生成失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[600px] max-h-[80vh] overflow-auto rounded-xl border border-border bg-bg p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-text">
          <i className="ti ti-sparkles mr-2 text-accent" />
          AI 生成 Pipeline
        </h2>

        {!result ? (
          <>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述你想要的流水线...&#10;例: 创建一个每天早8点执行的巡检流水线，并行检查 CPU/内存/磁盘，AI 汇总后如果有异常就发 Telegram 通知"
              rows={5}
              className="w-full rounded-lg border border-border bg-bg2 px-4 py-3 text-sm text-text placeholder:text-text3 focus:border-accent focus:outline-none"
            />
            {error && <p className="mt-2 text-xs text-red">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-text3 hover:bg-bg2">取消</button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading || !description.trim()}
                className={cn('rounded-lg px-4 py-2 text-sm font-medium', loading ? 'bg-bg2 text-text3' : 'bg-accent text-[#0f172a] hover:bg-accent/90')}
              >
                {loading ? '生成中...' : '生成'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-bg2 p-3">
              <pre className="max-h-60 overflow-auto text-xs font-mono text-text whitespace-pre-wrap">{result.yaml_content}</pre>
            </div>
            {result.validation && !result.validation.valid && (
              <div className="mt-2 text-xs text-red">
                {result.validation.errors?.map((e, i) => <p key={i}>❌ {e}</p>)}
              </div>
            )}
            {result.security?.security_level === 'needs_approval' && (
              <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-400">
                ⚠️ 包含特权操作，建议审查后再应用
              </div>
            )}
            {result.explanation && <p className="mt-2 text-xs text-text3">{result.explanation}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setResult(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-text3">重新生成</button>
              <button
                type="button"
                onClick={() => { onApply(result.yaml_content); onClose() }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-[#0f172a] hover:bg-accent/90"
              >
                应用到编辑器
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
