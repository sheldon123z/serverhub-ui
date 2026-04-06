/**
 * TaskBoardPanel - DAG task board shown above TodoPanel.
 * Displays tasks with status, assignee, dependencies, and progress.
 */

import { useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { cn, ensureArray } from '@/lib/utils'
import type { TaskItem } from '@/types/task'

const STATUS_ICONS: Record<string, string> = {
  pending: '\u2B1C',
  running: '\uD83D\uDD04',
  completed: '\u2705',
  failed: '\u274C',
  killed: '\u26D4',
}

const ASSIGNEE_COLORS: Record<string, string> = {
  'researcher': 'bg-purple-500/20 text-purple-400',
  'log-analyzer': 'bg-blue-500/20 text-blue-400',
  'security-auditor': 'bg-red-500/20 text-red-400',
  'correlation-analyzer': 'bg-amber-500/20 text-amber-400',
  'ops-scheduler': 'bg-green-500/20 text-green-400',
  'knowledge-retriever': 'bg-cyan-500/20 text-cyan-400',
}

export function TaskBoardPanel() {
  const rawTasks = useChatStore((s) => s.tasks)
  const tasks = ensureArray<TaskItem>(rawTasks)
  const [collapsed, setCollapsed] = useState(false)

  if (tasks.length === 0) return null

  const completed = tasks.filter((t) => t.status === 'completed').length
  const failed = tasks.filter((t) => t.status === 'failed' || t.status === 'killed').length
  const running = tasks.filter((t) => t.status === 'running').length
  const blocked = tasks.filter((t) => t.status === 'pending' && t.blocked_by.length > 0).length
  const ready = tasks.filter((t) => t.status === 'pending' && t.blocked_by.length === 0).length
  const total = tasks.length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="border-t border-border bg-bg2 shrink-0">
      {/* Header */}
      <button
        className="flex items-center justify-between w-full px-3 py-2 text-xs text-text2 hover:text-text transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="font-medium">
          Task Board
          <span className="ml-2 text-text3">
            {completed}/{total}
          </span>
          {running > 0 && (
            <span className="ml-1.5 text-accent task-pulse">{running} running</span>
          )}
        </span>
        <svg
          className={cn('w-3.5 h-3.5 transition-transform', collapsed && '-rotate-90')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-1.5">
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-bg overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                failed > 0 ? 'bg-red-500' : 'bg-accent',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* DAG summary */}
          <div className="flex gap-3 text-[10px] text-text3">
            {ready > 0 && <span>{ready} ready</span>}
            {blocked > 0 && <span>{blocked} blocked</span>}
            {running > 0 && <span className="text-accent">{running} running</span>}
            {failed > 0 && <span className="text-red-400">{failed} failed</span>}
          </div>

          {/* Task list */}
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} allTasks={tasks} />
            ))}
          </ul>
        </div>
      )}

      <style>{`
        @keyframes task-flash-green {
          0% { background: rgba(74, 222, 128, 0.25); }
          100% { background: transparent; }
        }
        .animate-task-flash-green {
          animation: task-flash-green 0.6s ease-out;
        }
        @keyframes task-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .task-pulse {
          animation: task-pulse 1.5s infinite;
        }
      `}</style>
    </div>
  )
}

function TaskCard({ task, allTasks }: { task: TaskItem; allTasks: TaskItem[] }) {
  const icon = STATUS_ICONS[task.status] || '\u2753'
  const isCompleted = task.status === 'completed'
  const isRunning = task.status === 'running'
  const isFailed = task.status === 'failed' || task.status === 'killed'
  const isBlocked = task.status === 'pending' && task.blocked_by.length > 0

  // Resolve blocker names
  const blockerNames = task.blocked_by
    .map((id) => {
      const t = allTasks.find((x) => x.id === id)
      return t ? t.name : id
    })
    .join(', ')

  return (
    <li
      className={cn(
        'flex flex-col gap-0.5 text-xs py-1 px-1.5 rounded',
        isCompleted && 'text-text3',
        isRunning && 'text-accent',
        isFailed && 'text-red-400',
        isBlocked && 'opacity-60',
        task._justCompleted && 'animate-task-flash-green',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('shrink-0', isRunning && 'task-pulse')}>{icon}</span>
        <span className={cn('flex-1 truncate', isCompleted && 'line-through')}>
          {task.name}
        </span>
        {task.assignee && (
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full shrink-0',
              ASSIGNEE_COLORS[task.assignee] || 'bg-text3/20 text-text3',
            )}
          >
            {task.assignee}
          </span>
        )}
      </div>

      {/* Blocked by indicator */}
      {isBlocked && (
        <span className="text-[10px] text-text3 ml-5 truncate">
          blocked by: {blockerNames}
        </span>
      )}

      {/* Output preview for completed/failed tasks */}
      {(isCompleted || isFailed) && task.output && (
        <span className="text-[10px] text-text3 ml-5 truncate">
          {task.output.slice(0, 100)}
        </span>
      )}
    </li>
  )
}
