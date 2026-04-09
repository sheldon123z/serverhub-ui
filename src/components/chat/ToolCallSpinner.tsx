/**
 * ToolCallSpinner — Claude Code 风格的工具调用动态指示器
 *
 * 核心特效：
 * - Braille 字符旋转动画 (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏)
 * - Shimmer 闪光扫过当前动词文字
 * - 工具名轮转显示
 * - 已用时间计时器
 * - 已完成工具数 / 总工具数进度
 * - 细进度条
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { Wrench, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getToolDisplayInfo } from '@/lib/message-utils'
import type { ToolCallItem } from '@/types/agent'

// ── Braille spinner 字符序列（和 Claude Code 一样的旋转方向）──
const SPINNER_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// ── 工具类型 → 语境化动词映射 ──
const TOOL_VERB_MAP: Record<string, string[]> = {
  // 系统查询类
  get_system_info: ['Scanning system', 'Inspecting metrics', 'Reading vitals'],
  get_system_snapshot: ['Scanning system', 'Collecting metrics', 'Profiling system'],
  get_docker_status: ['Checking containers', 'Inspecting Docker', 'Scanning services'],
  list_active_alerts: ['Checking alerts', 'Scanning warnings', 'Reviewing alarms'],
  get_service_status: ['Checking services', 'Inspecting daemons', 'Probing status'],
  get_network_info: ['Scanning network', 'Probing connectivity', 'Mapping routes'],
  get_gpu_info: ['Reading GPU stats', 'Probing accelerator', 'Scanning GPU'],
  // 文件操作类
  read_file: ['Reading file', 'Loading content', 'Fetching data'],
  write_file: ['Writing file', 'Saving changes', 'Persisting data'],
  edit_file: ['Editing file', 'Patching content', 'Applying diff'],
  list_directory: ['Browsing files', 'Listing directory', 'Scanning folder'],
  // Shell 执行类
  run_shell: ['Executing command', 'Running shell', 'Processing command'],
  run_shell_command: ['Executing command', 'Running shell', 'Processing command'],
  // 用户管理类
  get_user_info: ['Looking up user', 'Checking account', 'Fetching profile'],
  list_users: ['Listing users', 'Scanning accounts', 'Enumerating users'],
  // 通知类
  send_notification: ['Sending notification', 'Dispatching alert', 'Broadcasting message'],
  // 默认（匹配不到时使用）
  _default: ['Processing', 'Working', 'Analyzing', 'Computing', 'Evaluating',
             'Orchestrating', 'Synthesizing', 'Investigating', 'Resolving', 'Calibrating'],
}

function getContextualVerb(toolName: string): string {
  const verbs = TOOL_VERB_MAP[toolName] ?? TOOL_VERB_MAP._default
  return verbs[Math.floor(Math.random() * verbs.length)]
}

// ── Shimmer 效果：高亮字符在文字上扫过 ──
function ShimmerText({
  text,
  glimmerIndex,
  baseClass,
  shimmerClass,
}: {
  text: string
  glimmerIndex: number
  baseClass: string
  shimmerClass: string
}) {
  // 高亮窗口宽度
  const GLOW_RADIUS = 2

  return (
    <span aria-label={text}>
      {text.split('').map((char, i) => {
        const dist = Math.abs(i - glimmerIndex)
        const isLit = dist <= GLOW_RADIUS
        return (
          <span key={i} className={isLit ? shimmerClass : baseClass}>
            {char}
          </span>
        )
      })}
    </span>
  )
}

// ── 格式化已用时间 ──
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m${secs}s`
}

// ── 工具名称映射 ──
function getToolLabel(name: string): string {
  return getToolDisplayInfo(name).label
}

interface ToolCallSpinnerProps {
  /** 当前活跃（pending）的工具调用列表 */
  activeToolCalls: ToolCallItem[]
  /** 已完成的工具调用数量 */
  completedCount: number
  /** 工具调用总数 */
  totalCount: number
  className?: string
}

export function ToolCallSpinner({
  activeToolCalls,
  completedCount,
  totalCount,
  className,
}: ToolCallSpinnerProps) {
  // ── 动画时钟 ──
  const [tick, setTick] = useState(0)
  const startTimeRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // 50ms 动画循环
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1)
      setElapsed(Date.now() - startTimeRef.current)
    }, 50)
    return () => clearInterval(id)
  }, [])

  // ── 当前显示的工具（轮转，每 2s 切换）──
  const displayToolIndex = useMemo(() => {
    if (activeToolCalls.length === 0) return -1
    return Math.floor(tick / 40) % activeToolCalls.length // 40 ticks = 2s
  }, [tick, activeToolCalls.length])

  // ── 语境化动词（根据当前工具类型选择）──
  const [verb, setVerb] = useState(() =>
    getContextualVerb(activeToolCalls[0]?.name ?? '')
  )
  const prevToolRef = useRef(activeToolCalls[0]?.name ?? '')

  useEffect(() => {
    const currentTool = activeToolCalls[displayToolIndex]
    if (currentTool && currentTool.name !== prevToolRef.current) {
      prevToolRef.current = currentTool.name
      setVerb(getContextualVerb(currentTool.name))
    }
  }, [displayToolIndex, activeToolCalls])

  const currentTool = activeToolCalls[displayToolIndex] ?? activeToolCalls[0]

  // ── Spinner 字符 ──
  const spinnerFrame = Math.floor(tick / 2) % SPINNER_CHARS.length // 100ms per frame
  const spinnerChar = SPINNER_CHARS[spinnerFrame]

  // ── Shimmer 位置（从左到右扫过）──
  const verbText = verb + '…'
  const cycleLength = verbText.length + 10
  const glimmerIndex = Math.floor(tick / 3) % cycleLength - 3 // 150ms per step

  // ── 已完成工具的快速闪现 ──
  const prevCompletedRef = useRef(completedCount)
  const [justCompleted, setJustCompleted] = useState<string | null>(null)

  useEffect(() => {
    if (completedCount > prevCompletedRef.current) {
      // 找到刚完成的工具
      setJustCompleted('done')
      const timer = setTimeout(() => setJustCompleted(null), 600)
      prevCompletedRef.current = completedCount
      return () => clearTimeout(timer)
    }
  }, [completedCount])

  if (activeToolCalls.length === 0 && completedCount === 0) return null

  return (
    <div className={cn('flex justify-start', className)}>
      <div className="max-w-[85%] rounded-xl rounded-bl-sm px-4 py-3 glass">
        {/* 主动画行：spinner + shimmer 动词 + 状态 */}
        <div className="flex items-center gap-2">
          {/* Braille 旋转字符 */}
          <span
            className="text-accent font-mono text-sm font-bold select-none"
            style={{ width: '1em', display: 'inline-block', textAlign: 'center' }}
          >
            {spinnerChar}
          </span>

          {/* Shimmer 动词 */}
          <span className="text-sm font-medium">
            <ShimmerText
              text={verbText}
              glimmerIndex={glimmerIndex}
              baseClass="text-text2"
              shimmerClass="text-accent transition-colors duration-100"
            />
          </span>

          {/* 状态括号：(elapsed · progress) */}
          <span className="text-xs text-text3 tabular-nums">
            ({formatElapsed(elapsed)}
            {totalCount > 0 && (
              <> · {completedCount}/{totalCount}</>
            )}
            )
          </span>
        </div>

        {/* 当前工具行：显示正在执行的工具 */}
        {currentTool && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs overflow-hidden">
            <Wrench
              size={11}
              className={cn(
                'shrink-0 text-text3',
                justCompleted && 'animate-pulse text-green',
              )}
            />
            <span className="text-text3 truncate">
              <span className="text-text2 font-medium">{getToolLabel(currentTool.name)}</span>
              {currentTool.name && (
                <span className="ml-1 font-mono text-text3/70">{currentTool.name}</span>
              )}
            </span>
            {activeToolCalls.length > 1 && (
              <span className="ml-auto shrink-0 text-text3/50 tabular-nums">
                +{activeToolCalls.length - 1}
              </span>
            )}
          </div>
        )}

        {/* 已完成工具的快速闪现反馈 */}
        {justCompleted && completedCount > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-green animate-in fade-in slide-in-from-left-1 duration-300">
            <Check size={11} />
            <span>Tool completed</span>
          </div>
        )}

        {/* 细进度条 */}
        {totalCount > 0 && (
          <div className="mt-2 h-0.5 bg-border/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent/60 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
