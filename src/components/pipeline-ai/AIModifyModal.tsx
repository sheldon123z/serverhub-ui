import { useState } from 'react'
import { cn } from '@/lib/utils'
import { pipelinesApi } from '@/api/pipelines'
import type { AIModifyResponse } from '@/api/pipelines'

interface AIModifyModalProps {
  currentYaml: string
  pipelineName?: string
  onClose: () => void
  onApply: (yaml: string) => void
}

export function AIModifyModal({ currentYaml, pipelineName, onClose, onApply }: AIModifyModalProps) {
  const [instruction, setInstruction] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIModifyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleModify = async () => {
    if (!instruction.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await pipelinesApi.aiModify(currentYaml, instruction.trim())
      setResult(res.data)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail ?? '修改失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[700px] max-h-[80vh] overflow-auto rounded-xl border border-border bg-bg p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-text">
          <i className="ti ti-edit mr-2 text-accent" />
          AI 修改 {pipelineName ? `— ${pipelineName}` : 'Pipeline'}
        </h2>

        {!result ? (
          <>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="描述要修改的内容...&#10;例: 把触发方式改为每6小时一次，并在安全扫描后加一个审批步骤"
              rows={3}
              className="w-full rounded-lg border border-border bg-bg2 px-4 py-3 text-sm text-text placeholder:text-text3 focus:border-accent focus:outline-none"
            />
            {error && <p className="mt-2 text-xs text-red">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-text3">取消</button>
              <button
                type="button"
                onClick={handleModify}
                disabled={loading || !instruction.trim()}
                className={cn('rounded-lg px-4 py-2 text-sm font-medium', loading ? 'bg-bg2 text-text3' : 'bg-accent text-[#0f172a]')}
              >
                {loading ? '修改中...' : '修改'}
              </button>
            </div>
          </>
        ) : (
          <>
            {result.changes.length > 0 && (
              <div className="mb-3 rounded-lg border border-border bg-bg2 p-3">
                <h4 className="text-xs font-medium text-text3 mb-1">改动摘要:</h4>
                <ul className="space-y-0.5 text-xs text-text2">
                  {result.changes.map((c, i) => <li key={i}>• {c}</li>)}
                </ul>
              </div>
            )}
            <div className="rounded-lg border border-border bg-bg2 p-3">
              <pre className="max-h-60 overflow-auto text-xs font-mono text-text whitespace-pre-wrap">{result.yaml_content}</pre>
            </div>
            {result.security?.security_level === 'needs_approval' && (
              <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-400">
                ⚠️ 修改后包含特权操作
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setResult(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-text3">重试</button>
              <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-text3">放弃</button>
              <button
                type="button"
                onClick={() => { onApply(result.yaml_content); onClose() }}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-[#0f172a]"
              >
                应用修改
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
