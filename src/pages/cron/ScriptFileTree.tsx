import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import client from '@/api/client'
import { cn } from '@/lib/utils'

interface ScriptFileTreeProps {
  onSelectFile: (path: string, content: string) => void
  currentFilePath?: string
}

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

export function ScriptFileTree({ onSelectFile, currentFilePath }: ScriptFileTreeProps) {
  const username = useAuthStore(s => s.user)?.username ?? 'zhengxiaodong'
  // 后端 validate_path 不展开 ~，必须用绝对路径
  const scriptDir = `/home/${username}/scripts`

  const { data, isLoading } = useQuery<FileEntry[]>({
    queryKey: ['script-files', scriptDir],
    queryFn: async () => {
      const res = await client.get('/api/files/list', {
        params: { path: scriptDir },
      })
      const items = (res.data?.items ?? res.data?.entries ?? []) as FileEntry[]
      return items.filter((e: FileEntry) =>
        e.type === 'file' && /\.(sh|bash|py|pl|rb)$/i.test(e.name)
      )
    },
    staleTime: 30_000,
    retry: 1,
  })

  async function handleClick(file: FileEntry) {
    try {
      const res = await client.get('/api/files/read', {
        params: { path: file.path },
      })
      const content = typeof res.data === 'string' ? res.data : (res.data?.content ?? '')
      onSelectFile(file.path, content)
    } catch {
      onSelectFile(file.path, '')
    }
  }

  return (
    <div className="flex flex-col h-full border-r border-border" style={{ width: 160 }}>
      <div className="px-2 py-1.5 border-b border-border flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px]">📁</span>
        <span className="text-[10px] font-semibold text-text3 uppercase tracking-wider flex-1">脚本目录</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-2 py-2 text-[10px] text-text3">加载中...</div>
        ) : !data?.length ? (
          <div className="px-2 py-2 text-[10px] text-text3">~/scripts/ 无脚本文件</div>
        ) : (
          data.map(file => (
            <button
              key={file.path}
              onClick={() => handleClick(file)}
              className={cn(
                'w-full text-left px-2 py-1 text-[10px] truncate transition-colors flex items-center gap-1.5',
                currentFilePath === file.path
                  ? 'bg-accent-dim text-accent'
                  : 'text-text2 hover:bg-card hover:text-text'
              )}
              title={file.path}
            >
              <span className="opacity-60">📄</span>
              <span className="truncate">{file.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
