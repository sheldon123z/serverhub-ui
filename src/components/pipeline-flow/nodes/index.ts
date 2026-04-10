import type { NodeTypes } from '@xyflow/react'
import { BaseStepNode } from './BaseStepNode'
import { ConditionNode } from './ConditionNode'
import { ParallelNode } from './ParallelNode'

/* ─── Step type visual config ─── */

export const STEP_ACCENT: Record<string, string> = {
  shell: '#374151',
  ssh: '#06b6d4',
  agent: '#8b5cf6',
  approval: '#f59e0b',
  decision: '#f59e0b',
  condition: '#3b82f6',
  parallel: '#10b981',
  notify: '#eab308',
  http: '#64748b',
  delay: '#9ca3af',
  playbook: '#6366f1',
}

export const STEP_ICON: Record<string, string> = {
  shell: 'ti-terminal-2',
  ssh: 'ti-network',
  agent: 'ti-robot',
  approval: 'ti-user-check',
  decision: 'ti-git-compare',
  condition: 'ti-git-branch',
  parallel: 'ti-arrows-split',
  notify: 'ti-bell',
  http: 'ti-world',
  delay: 'ti-hourglass',
  playbook: 'ti-script',
}

export const STEP_LABEL: Record<string, string> = {
  shell: 'Shell',
  ssh: 'SSH',
  agent: 'AI Agent',
  approval: '审批',
  decision: '决策',
  condition: '条件',
  parallel: '并行',
  notify: '通知',
  http: 'HTTP',
  delay: '延时',
  playbook: '剧本',
}

/* ─── Node types registry (MUST be module-level const) ─── */

export const nodeTypes: NodeTypes = {
  shell: BaseStepNode,
  ssh: BaseStepNode,
  agent: BaseStepNode,
  approval: BaseStepNode,
  decision: BaseStepNode,
  notify: BaseStepNode,
  http: BaseStepNode,
  delay: BaseStepNode,
  playbook: BaseStepNode,
  condition: ConditionNode,
  parallel: ParallelNode,
}
