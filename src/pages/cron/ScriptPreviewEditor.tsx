import { useState, useRef, useCallback, useEffect } from 'react'
import { diffLines } from 'diff'
import { cn } from '@/lib/utils'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { detectLanguage } from '@/types/cron-agent'

interface ScriptPreviewEditorProps {
  content: string
  filePath: string
  originalContent?: string
  onContentChange: (newContent: string) => void
  onWriteToServer?: (content: string) => Promise<void>
  onSendToAI?: (selectedText: string) => void
}

type ViewMode = 'view' | 'edit' | 'diff'

export function ScriptPreviewEditor({
  content,
  filePath,
  originalContent,
  onContentChange,
  onWriteToServer,
  onSendToAI,
}: ScriptPreviewEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('view')
  const [isWriting, setIsWriting] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [selectedText, setSelectedText] = useState('')
  const baselineRef = useRef<string>(originalContent ?? content)

  useEffect(() => {
    if (originalContent !== undefined) {
      baselineRef.current = originalContent
    }
  }, [originalContent])

  useEffect(() => {
    setIsSaved(false)
  }, [content])

  const handleWriteToServer = useCallback(async () => {
    if (!onWriteToServer) return
    setIsWriting(true)
    try {
      await onWriteToServer(content)
      setIsSaved(true)
      baselineRef.current = content
    } finally {
      setIsWriting(false)
    }
  }, [content, onWriteToServer])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content)
  }, [content])

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection()?.toString() ?? ''
    setSelectedText(sel)
  }, [])

  const handleSendToAI = useCallback(() => {
    if (selectedText && onSendToAI) {
      onSendToAI(selectedText)
      setSelectedText('')
    }
  }, [selectedText, onSendToAI])

  const diffChunks = diffLines(baselineRef.current, content)
  const hasDiff = diffChunks.some(c => c.added || c.removed)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg2/50 flex-shrink-0">
        <code className="text-[11px] font-mono text-text2 flex-1 truncate">{filePath || '未命名脚本'}</code>
        <div className="flex items-center gap-1.5">
          {/* View/Edit toggle */}
          <button
            aria-label="查看模式"
            onClick={() => setViewMode(v => v === 'view' ? 'edit' : 'view')}
            className={cn(
              'text-[10px] font-semibold px-2 py-1 rounded border transition-colors',
              viewMode === 'edit'
                ? 'bg-yellow/15 text-yellow border-yellow/30'
                : viewMode === 'view'
                ? 'bg-accent/15 text-accent border-accent/30'
                : 'text-text3 border-border hover:text-text'
            )}
          >
            {viewMode === 'edit' ? '✏️ 编辑中' : '👁️ 预览'}
          </button>
          {hasDiff && (
            <button
              aria-label="Diff 视图"
              onClick={() => setViewMode(v => v === 'diff' ? 'edit' : 'diff')}
              className={cn(
                'text-[10px] font-semibold px-2 py-1 rounded border transition-colors',
                viewMode === 'diff'
                  ? 'bg-accent/15 text-accent border-accent/30'
                  : 'text-text3 border-border hover:text-text'
              )}
            >
              Diff {hasDiff && <span className="ml-1 text-yellow">●</span>}
            </button>
          )}
          {onWriteToServer && (
            <button
              aria-label="写入服务器"
              onClick={handleWriteToServer}
              disabled={isWriting}
              className="text-[10px] font-semibold px-2 py-1 rounded border border-green/25 bg-green/10 text-green hover:bg-green/20 transition-colors"
            >
              {isWriting ? '写入中...' : '💾 写入服务器'}
            </button>
          )}
          <button
            aria-label="复制"
            onClick={handleCopy}
            className="text-[10px] font-semibold px-2 py-1 rounded border border-border text-text3 hover:text-text transition-colors"
          >
            复制
          </button>
          {onSendToAI && selectedText && (
            <button
              onClick={handleSendToAI}
              className="text-[10px] font-semibold px-2 py-1 rounded bg-accent/15 text-accent border border-accent/30 animate-pulse"
            >
              ✦ 发给 AI
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {viewMode === 'diff' && hasDiff ? (
          <div className="font-mono text-[11px] leading-relaxed p-3 select-text" onMouseUp={handleSelectionChange}>
            {diffChunks.map((chunk, i) => {
              const filteredLines = chunk.value.replace(/\n$/, '').split('\n')
              return filteredLines.map((line, lineIdx) => (
                <div
                  key={`${i}-${lineIdx}`}
                  className={cn(
                    'flex gap-2 px-2 py-0.5 rounded-sm',
                    chunk.added && 'diff-added bg-green/10 text-green',
                    chunk.removed && 'diff-removed bg-red/10 text-red line-through opacity-70',
                    !chunk.added && !chunk.removed && 'text-text2'
                  )}
                >
                  <span className="w-4 text-center opacity-60 select-none flex-shrink-0">
                    {chunk.added ? '+' : chunk.removed ? '-' : ' '}
                  </span>
                  <span className="whitespace-pre flex-1">{line}</span>
                </div>
              ))
            })}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={e => onContentChange(e.target.value)}
            onMouseUp={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            className="w-full h-full min-h-full resize-none bg-transparent border-none outline-none font-mono text-[11px] leading-relaxed p-3 text-text2"
            spellCheck={false}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border text-[10px] bg-bg2/30 flex-shrink-0">
        <span className={cn(
          'flex items-center gap-1',
          isSaved ? 'text-green' : content !== baselineRef.current ? 'text-yellow' : 'text-text3'
        )}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {isSaved ? '已保存' : content !== baselineRef.current ? '已修改，未保存' : '未修改'}
        </span>
        {hasDiff && (
          <span className="text-text3">
            {diffChunks.filter(c => c.added).reduce((s, c) => s + c.value.split('\n').length - 1, 0)}+ /&nbsp;
            {diffChunks.filter(c => c.removed).reduce((s, c) => s + c.value.split('\n').length - 1, 0)}-
          </span>
        )}
        {selectedText && (
          <span className="text-accent bg-accent/10 px-1.5 rounded">
            已选 {selectedText.split('\n').length} 行
          </span>
        )}
      </div>
    </div>
  )
}
