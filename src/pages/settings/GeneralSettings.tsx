import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '@/api/client'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

export function GeneralSettings() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['agent-settings'],
    queryFn: () => client.get('/api/agents/settings').then((r) => r.data),
  })

  const [shellTimeout, setShellTimeout] = useState(30)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data) {
      setShellTimeout(data.shell_timeout)
      setDirty(false)
    }
  }, [data])

  const saveMut = useMutation({
    mutationFn: () =>
      client.put('/api/agents/settings', {
        default_model: data?.default_model,
        patrol_model: data?.patrol_model,
        shell_timeout: shellTimeout,
      }),
    onSuccess: () => {
      toast.success('设置已保存')
      setDirty(false)
      qc.invalidateQueries({ queryKey: ['agent-settings'] })
    },
    onError: () => toast.error('保存失败'),
  })

  if (isLoading) return <p className="text-text3 text-sm">加载中...</p>

  return (
    <div>
      <h3 className="text-base font-semibold mb-4 text-text">通用设置</h3>
      <div className="glass rounded-lg p-5 space-y-5">
        <div>
          <label className="text-text2 text-sm font-medium block mb-1.5">Shell 超时 (秒)</label>
          <input
            type="number"
            value={shellTimeout}
            onChange={(e) => { setShellTimeout(parseInt(e.target.value) || 30); setDirty(true) }}
            min={5} max={600}
            className="bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:border-accent focus:outline-none w-40"
          />
          <p className="text-text3 text-xs mt-1">Agent 执行 Shell 命令的最大等待时间</p>
        </div>
        <button
          onClick={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending}
          className={cn(
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            dirty ? 'bg-accent text-[#0f172a] hover:opacity-90' : 'bg-border text-text3 cursor-not-allowed',
          )}
        >
          {saveMut.isPending ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
