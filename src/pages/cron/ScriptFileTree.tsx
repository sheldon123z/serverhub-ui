import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import client from '@/api/client'
import { cn } from '@/lib/utils'

interface GeneratedFile {
  name: string
  path: string
  content: string
}

interface ScriptFileTreeProps {
  onSelectFile: (path: string, content: string) => void
  currentFilePath?: string
  /** AI 会话中通过 write_file 生成的脚本 */
  generatedFiles?: GeneratedFile[]
}

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

export function ScriptFileTree({ onSelectFile, currentFilePath, generatedFiles = [] }: ScriptFileTreeProps) {
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

  // 去重：如果生成文件与 ~/scripts/ 中同名则不重复显示
  const diskPaths = new Set(data?.map(f => f.path) ?? [])
  const uniqueGenerated = generatedFiles.filter(gf => !diskPaths.has(gf.path))

  return (
    <div className="flex flex-col h-full border-r border-border" style={{ width: 160 }}>
      {/* 生成的脚本（当前会话） */}
      {uniqueGenerated.length > 0 && (
        <>
          <div className="px-2 py-1.5 border-b border-border flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px]">⚡</span>
            <span className="text-[10px] font-semibold text-accent uppercase tracking-wider flex-1">生成的脚本</span>
          </div>
          <div className="overflow-y-auto py-1 border-b border-border">
            {uniqueGenerated.map(gf => (
              <button
                key={gf.path}
                onClick={() => onSelectFile(gf.path, gf.content)}
                className={cn(
                  'w-full text-left px-2 py-1 text-[10px] truncate transition-colors flex items-center gap-1.5',
                  currentFilePath === gf.path
                    ? 'bg-accent-dim text-accent'
                    : 'text-text2 hover:bg-card hover:text-text'
                )}
                title={gf.path}
              >
                <span className="opacity-60">✨</span>
                <span className="truncate">{gf.name}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ~/scripts/ 目录 */}
      <div className="px-2 py-1.5 border-b border-border flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px]">📁</span>
        <span className="text-[10px] font-semibold text-text3 uppercase tracking-wider flex-1">~/scripts/</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-2 py-2 text-[10px] text-text3">加载中...</div>
        ) : !data?.length ? (
          <div className="px-2 py-2 text-[10px] text-text3">无脚本文件</div>
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
