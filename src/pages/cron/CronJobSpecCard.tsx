import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useServerStore } from '@/stores/serverStore'
import { useAuthStore } from '@/stores/authStore'
import client from '@/api/client'
import toast from 'react-hot-toast'
import { type CronJobSpec, cronToHuman } from '@/types/cron-agent'

interface CronJobSpecCardProps {
  spec: CronJobSpec
  /** 当用户点击"编辑脚本"时回调，传入脚本内容和路径 */
  onEditScript?: (content: string, path: string) => void
  /** 已添加到列表标记 */
  added?: boolean
}

export function CronJobSpecCard({ spec, onEditScript, added = false }: CronJobSpecCardProps) {
  const [adding, setAdding] = useState(false)
  const [writing, setWriting] = useState(false)
  const [done, setDone] = useState(added)
  const qc = useQueryClient()
  const serverId = useServerStore(s => s.selectedServerId)
  const user = useAuthStore(s => s.user)
  const cronUser = user?.username ?? ''

  async function handleAddToList() {
    if (done) return
    setAdding(true)
    try {
      await client.post('/api/cron/jobs', {
        cron_user: cronUser,
        schedule: spec.schedule,
        command: spec.command,
        comment: spec.comment ?? '',
      }, { params: { server_id: serverId } })
      toast.success('已加入任务列表')
      setDone(true)
      qc.invalidateQueries({ queryKey: ['cron'] })
    } catch {
      toast.error('添加失败')
    } finally {
      setAdding(false)
    }
  }

  async function handleWriteToServer() {
    if (!spec.script_content || !spec.script_path) {
      toast.error('无脚本内容可写入')
      return
    }
    const path = spec.script_path.replace(/^~/, `/home/${cronUser}`)
    setWriting(true)
    try {
      await client.put('/api/files/write', { path, content: spec.script_content })
      toast.success(`脚本已写入: ${spec.script_path}`)
    } catch {
      toast.error('写入失败，请检查路径权限')
    } finally {
      setWriting(false)
    }
  }

  function handleEditScript() {
    if (spec.script_content && spec.script_path && onEditScript) {
      onEditScript(spec.script_content, spec.script_path)
    }
  }

  return (
    <div className="glass rounded-lg p-3 mt-2 border border-accent/30">
      {/* Schedule */}
      <div className="flex items-start gap-2 mb-2">
        <span className="text-[10px] font-semibold text-text3 uppercase tracking-wider w-10 mt-0.5 shrink-0">计划</span>
        <div>
          <code className="text-accent text-[11px] font-mono font-semibold">{spec.schedule}</code>
          <span className="text-text3 text-[10px] ml-2">{cronToHuman(spec.schedule)}</span>
        </div>
      </div>
      {/* Command */}
      <div className="flex items-start gap-2 mb-2">
        <span className="text-[10px] font-semibold text-text3 uppercase tracking-wider w-10 mt-0.5 shrink-0">命令</span>
        <code className="text-text text-[11px] font-mono break-all">{spec.command}</code>
      </div>
      {/* Comment */}
      {spec.comment && (
        <div className="flex items-start gap-2 mb-2">
          <span className="text-[10px] font-semibold text-text3 uppercase tracking-wider w-10 mt-0.5 shrink-0">说明</span>
          <span className="text-text2 text-[11px]">{spec.comment}</span>
        </div>
      )}
      {/* Script indicator */}
      {spec.script_content && (
        <div className="flex items-center gap-1.5 mb-3 text-[10px] text-text3">
          <span>📄</span>
          <code className="font-mono">{spec.script_path ?? '脚本'}</code>
          <span className="text-green text-[9px]">· 已生成</span>
        </div>
      )}
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleAddToList}
          disabled={adding || done}
          className={`text-[11px] font-semibold px-3 py-1.5 rounded-md transition-colors ${
            done
              ? 'bg-green/15 text-green border border-green/25 cursor-default'
              : 'bg-accent text-[#0f172a] hover:opacity-90'
          }`}
        >
          {done ? '✓ 已加入列表' : adding ? '添加中...' : '+ 加入列表'}
        </button>
        {spec.script_content && (
          <>
            <button
              onClick={handleWriteToServer}
              disabled={writing}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-green/12 text-green border border-green/25 hover:bg-green/20 transition-colors"
            >
              {writing ? '写入中...' : '💾 写入服务器'}
            </button>
            <button
              onClick={handleEditScript}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-md bg-yellow/10 text-yellow border border-yellow/25 hover:bg-yellow/20 transition-colors"
            >
              ✏️ 编辑脚本
            </button>
          </>
        )}
      </div>
    </div>
  )
}
