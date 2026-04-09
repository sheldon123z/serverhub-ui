# Pipeline Visual Editor Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Phase 1 read-only flow canvas into a full visual editor with drag-and-drop node creation, property editing, and bidirectional YAML sync.

**Architecture:** Add 4 new components (`StepPalette`, `PropertyPanel`, `useFlowEditor`, `useFlowToYaml`) and 11 property form components. Modify `PipelineFlowView` to switch between read-only and edit modes. Share `editorContent` state with `PipelinesPage` for YAML sync. Zero backend changes.

**Tech Stack:** @xyflow/react (already installed), React 19, TypeScript, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/pipeline-flow/useFlowEditor.ts` | Central state: nodes/edges/selection + add/remove/connect/update |
| Create | `src/components/pipeline-flow/useFlowToYaml.ts` | Nodes/edges → YAML string serialization |
| Create | `src/components/pipeline-flow/StepPalette.tsx` | Left 48px toolbar, draggable step type icons |
| Create | `src/components/pipeline-flow/property-forms/CommonFields.tsx` | Shared fields: name, id, timeout, on_failure, retry |
| Create | `src/components/pipeline-flow/property-forms/ShellForm.tsx` | Shell step: command textarea |
| Create | `src/components/pipeline-flow/property-forms/SshForm.tsx` | SSH step: host + command |
| Create | `src/components/pipeline-flow/property-forms/AgentForm.tsx` | Agent step: prompt + model + output_format |
| Create | `src/components/pipeline-flow/property-forms/ApprovalForm.tsx` | Approval step: assignee + timeout |
| Create | `src/components/pipeline-flow/property-forms/ConditionForm.tsx` | Condition step: expression + target selectors |
| Create | `src/components/pipeline-flow/property-forms/ParallelForm.tsx` | Parallel step: branch management |
| Create | `src/components/pipeline-flow/property-forms/NotifyForm.tsx` | Notify step: channel + message |
| Create | `src/components/pipeline-flow/property-forms/HttpForm.tsx` | HTTP step: url + method + headers + body |
| Create | `src/components/pipeline-flow/property-forms/DelayForm.tsx` | Delay step: seconds |
| Create | `src/components/pipeline-flow/property-forms/PlaybookForm.tsx` | Playbook step: playbook_id |
| Create | `src/components/pipeline-flow/property-forms/index.ts` | Registry: step type → form component |
| Create | `src/components/pipeline-flow/PropertyPanel.tsx` | Right drawer: renders CommonFields + type-specific form |
| Modify | `src/components/pipeline-flow/nodes/BaseStepNode.tsx` | Add selected state highlight |
| Modify | `src/components/pipeline-flow/nodes/ConditionNode.tsx` | Add selected state highlight |
| Modify | `src/components/pipeline-flow/nodes/ParallelNode.tsx` | Add selected state highlight |
| Modify | `src/components/pipeline-flow/PipelineFlowView.tsx` | Edit mode: integrate palette + panel + editor hook |
| Modify | `src/pages/PipelinesPage.tsx` | Bidirectional sync: visual ↔ YAML shared state |

---

### Task 1: useFlowEditor — Central State Hook

**Files:**
- Create: `src/components/pipeline-flow/useFlowEditor.ts`

- [ ] **Step 1: Create the useFlowEditor hook**

Create `src/components/pipeline-flow/useFlowEditor.ts`:

```ts
import { useCallback, useState } from 'react'
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from '@xyflow/react'
import { STEP_ACCENT, STEP_ICON, STEP_LABEL } from './nodes'

let _idCounter = 0
function genNodeId(type: string): string {
  _idCounter++
  return `step-${type}-${_idCounter.toString(36)}${Date.now().toString(36).slice(-4)}`
}

function defaultNodeData(type: string) {
  return {
    name: `新建${STEP_LABEL[type] ?? type}步骤`,
    type,
    icon: STEP_ICON[type] ?? 'ti-point',
    accent: STEP_ACCENT[type] ?? '#6b7280',
    timeout: 30,
    on_failure: 'abort',
    retry_count: 0,
    retry_delay: 5,
  }
}

function hasPath(edges: Edge[], from: string, to: string, visited = new Set<string>()): boolean {
  if (from === to) return true
  if (visited.has(from)) return false
  visited.add(from)
  for (const e of edges) {
    if (e.source === from && hasPath(edges, e.target, to, visited)) return true
  }
  return false
}

export interface FlowEditorReturn {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  dirty: boolean

  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange

  addNode: (type: string, position: { x: number; y: number }) => string
  removeNode: (id: string) => void
  updateNodeData: (id: string, data: Record<string, unknown>) => void
  selectNode: (id: string | null) => void

  onConnect: (connection: Connection) => void
  removeEdge: (id: string) => void

  loadFromSteps: (nodes: Node[], edges: Edge[]) => void
  markClean: () => void
}

export function useFlowEditor(): FlowEditorReturn {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const addNode = useCallback((type: string, position: { x: number; y: number }): string => {
    const id = genNodeId(type)
    const newNode: Node = {
      id,
      type,
      position,
      data: defaultNodeData(type),
    }
    setNodes((nds) => [...nds, newNode])
    setDirty(true)
    setSelectedNodeId(id)
    return id
  }, [setNodes])

  const removeNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    if (selectedNodeId === id) setSelectedNodeId(null)
    setDirty(true)
  }, [setNodes, setEdges, selectedNodeId])

  const updateNodeData = useCallback((id: string, data: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
    )
    setDirty(true)
  }, [setNodes])

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id)
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    const { source, target } = connection
    if (!source || !target) return

    // Self-loop check
    if (source === target) return

    // Duplicate check
    setEdges((eds) => {
      const exists = eds.some(
        (e) =>
          e.source === source &&
          e.target === target &&
          e.sourceHandle === (connection.sourceHandle ?? null) &&
          e.targetHandle === (connection.targetHandle ?? null),
      )
      if (exists) return eds

      // Cycle check
      if (hasPath(eds, target, source)) return eds

      setDirty(true)
      return addEdge(
        {
          ...connection,
          type: 'smoothstep',
        },
        eds,
      )
    })
  }, [setEdges])

  const removeEdge = useCallback((id: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== id))
    setDirty(true)
  }, [setEdges])

  const loadFromSteps = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    setNodes(newNodes)
    setEdges(newEdges)
    setSelectedNodeId(null)
    setDirty(false)
  }, [setNodes, setEdges])

  const markClean = useCallback(() => {
    setDirty(false)
  }, [])

  return {
    nodes,
    edges,
    selectedNodeId,
    dirty,
    onNodesChange: useCallback<OnNodesChange>((changes) => {
      onNodesChange(changes)
      const hasMoved = changes.some((c) => c.type === 'position' && c.dragging === false)
      if (hasMoved) setDirty(true)
    }, [onNodesChange]),
    onEdgesChange,
    addNode,
    removeNode,
    updateNodeData,
    selectNode,
    onConnect,
    removeEdge,
    loadFromSteps,
    markClean,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline-flow/useFlowEditor.ts
git commit -m "feat: add useFlowEditor — central state management for pipeline visual editor"
```

---

### Task 2: useFlowToYaml — Reverse Serialization

**Files:**
- Create: `src/components/pipeline-flow/useFlowToYaml.ts`

- [ ] **Step 1: Create the flow-to-YAML serialization hook**

Create `src/components/pipeline-flow/useFlowToYaml.ts`:

```ts
import { useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.trim() ? pad + line : ''))
    .join('\n')
}

function escapeYaml(val: unknown): string {
  if (val == null) return '""'
  const s = String(val)
  if (!s) return '""'
  if (/[:#\[\]{}&*!|>'"%@`,?]/.test(s) || s.includes('\n') || s !== s.trim()) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  }
  return s
}

interface StepData {
  id: string
  type: string
  name?: string
  command?: string
  host?: string
  prompt?: string
  model?: string
  output_format?: string
  assignee?: string
  expression?: string
  on_true?: string
  on_false?: string
  channel?: string
  message?: string
  url?: string
  method?: string
  headers?: Record<string, string>
  body?: string
  seconds?: number
  playbook_id?: string
  timeout?: number
  on_failure?: string
  retry_count?: number
  retry_delay?: number
  branchCount?: number
  [key: string]: unknown
}

function topoSort(nodes: Node[], edges: Edge[]): Node[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  const nodeMap = new Map<string, Node>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
    nodeMap.set(n.id, n)
  }

  for (const e of edges) {
    if (inDegree.has(e.target)) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1)
    }
    adj.get(e.source)?.push(e.target)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: Node[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    const node = nodeMap.get(id)
    if (node) sorted.push(node)
    for (const next of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, newDeg)
      if (newDeg === 0) queue.push(next)
    }
  }

  // Add any remaining nodes not reached (orphans)
  for (const n of nodes) {
    if (!sorted.find((s) => s.id === n.id)) sorted.push(n)
  }

  return sorted
}

function serializeStep(node: Node, edges: Edge[], allNodes: Node[]): string {
  const d = node.data as StepData
  const lines: string[] = []

  lines.push(`- id: ${escapeYaml(node.id)}`)
  lines.push(`  type: ${d.type}`)
  lines.push(`  name: ${escapeYaml(d.name ?? node.id)}`)

  // Type-specific fields
  switch (d.type) {
    case 'shell':
      if (d.command) lines.push(`  command: ${escapeYaml(d.command)}`)
      break
    case 'ssh':
      if (d.host) lines.push(`  host: ${escapeYaml(d.host)}`)
      if (d.command) lines.push(`  command: ${escapeYaml(d.command)}`)
      break
    case 'agent':
      if (d.prompt) lines.push(`  prompt: ${escapeYaml(d.prompt)}`)
      if (d.model) lines.push(`  model: ${escapeYaml(d.model)}`)
      if (d.output_format) lines.push(`  output_format: ${escapeYaml(d.output_format)}`)
      break
    case 'approval':
      if (d.assignee) lines.push(`  assignee: ${escapeYaml(d.assignee)}`)
      break
    case 'condition': {
      if (d.expression) lines.push(`  expression: ${escapeYaml(d.expression)}`)
      // Derive on_true/on_false from edges
      const trueEdge = edges.find((e) => e.source === node.id && e.sourceHandle === 'handle-true')
      const falseEdge = edges.find((e) => e.source === node.id && e.sourceHandle === 'handle-false')
      if (trueEdge) lines.push(`  on_true: ${escapeYaml(trueEdge.target)}`)
      if (falseEdge) lines.push(`  on_false: ${escapeYaml(falseEdge.target)}`)
      break
    }
    case 'parallel': {
      // Find branch nodes: nodes connected from this parallel node's outgoing edges
      // that are NOT in the top-level step list (they're branch sub-nodes)
      const forkEdges = edges.filter((e) => e.source === node.id)
      if (forkEdges.length > 0) {
        lines.push(`  branches:`)
        for (const fe of forkEdges) {
          // Trace the branch chain
          let current = fe.target
          const branchSteps: string[] = []
          const visited = new Set<string>()
          while (current && !visited.has(current)) {
            visited.add(current)
            const bn = allNodes.find((n) => n.id === current)
            if (!bn) break
            const bd = bn.data as StepData
            branchSteps.push(`      - id: ${escapeYaml(bn.id)}`)
            branchSteps.push(`        type: ${bd.type}`)
            if (bd.name) branchSteps.push(`        name: ${escapeYaml(bd.name)}`)
            if (bd.command) branchSteps.push(`        command: ${escapeYaml(bd.command)}`)
            // Follow the chain
            const nextEdge = edges.find((e) => e.source === current && !e.id.includes('-join-'))
            current = nextEdge?.target ?? ''
          }
          if (branchSteps.length > 0) {
            lines.push(...branchSteps)
          }
        }
      }
      break
    }
    case 'notify':
      if (d.channel) lines.push(`  channel: ${escapeYaml(d.channel)}`)
      if (d.message) lines.push(`  message: ${escapeYaml(d.message)}`)
      break
    case 'http':
      if (d.url) lines.push(`  url: ${escapeYaml(d.url)}`)
      if (d.method) lines.push(`  method: ${d.method}`)
      if (d.body) lines.push(`  body: ${escapeYaml(d.body)}`)
      break
    case 'delay':
      if (d.seconds != null) lines.push(`  seconds: ${d.seconds}`)
      break
    case 'playbook':
      if (d.playbook_id) lines.push(`  playbook_id: ${escapeYaml(d.playbook_id)}`)
      break
  }

  // Common optional fields
  if (d.timeout && d.timeout !== 30) lines.push(`  timeout: ${d.timeout}`)
  if (d.on_failure && d.on_failure !== 'abort') lines.push(`  on_failure: ${d.on_failure}`)
  if (d.retry_count && d.retry_count > 0) {
    lines.push(`  retry_count: ${d.retry_count}`)
    if (d.retry_delay) lines.push(`  retry_delay: ${d.retry_delay}`)
  }

  return lines.join('\n')
}

export function flowToYaml(
  nodes: Node[],
  edges: Edge[],
  meta?: { name?: string; display_name?: string; description?: string; version?: number },
): string {
  if (nodes.length === 0) return ''

  // Filter out branch sub-nodes (they're serialized inside parallel steps)
  // Branch sub-nodes are targets of fork edges from parallel nodes
  const parallelIds = new Set(nodes.filter((n) => n.type === 'parallel').map((n) => n.id))
  const branchNodeIds = new Set<string>()
  for (const e of edges) {
    if (parallelIds.has(e.source) && !e.id.includes('-join-')) {
      // Trace branch chain
      let current = e.target
      const visited = new Set<string>()
      while (current && !visited.has(current)) {
        visited.add(current)
        branchNodeIds.add(current)
        const nextEdge = edges.find((ne) => ne.source === current && !ne.id.includes('-join-'))
        current = nextEdge?.target ?? ''
      }
    }
  }

  const topLevelNodes = nodes.filter((n) => !branchNodeIds.has(n.id))
  const sorted = topoSort(topLevelNodes, edges)

  const header = [
    `name: ${escapeYaml(meta?.name ?? 'untitled')}`,
    `display_name: ${escapeYaml(meta?.display_name ?? 'Untitled Pipeline')}`,
    `description: ${escapeYaml(meta?.description ?? '')}`,
    `version: ${meta?.version ?? 1}`,
    '',
    'trigger:',
    '  type: manual',
    '',
    'steps:',
  ]

  const stepLines = sorted.map((n) => serializeStep(n, edges, nodes))

  return header.join('\n') + '\n' + stepLines.join('\n')
}

export function useFlowToYaml(
  nodes: Node[],
  edges: Edge[],
  meta?: { name?: string; display_name?: string; description?: string; version?: number },
): string {
  return useMemo(() => flowToYaml(nodes, edges, meta), [nodes, edges, meta])
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline-flow/useFlowToYaml.ts
git commit -m "feat: add useFlowToYaml — reverse serialization from React Flow to YAML"
```

---

### Task 3: StepPalette — Left Sidebar

**Files:**
- Create: `src/components/pipeline-flow/StepPalette.tsx`

- [ ] **Step 1: Create the StepPalette component**

Create `src/components/pipeline-flow/StepPalette.tsx`:

```tsx
import { memo, useCallback } from 'react'
import { STEP_ACCENT, STEP_ICON, STEP_LABEL } from './nodes'

const STEP_TYPES = [
  'shell', 'ssh', 'agent', 'approval', 'condition',
  'parallel', 'notify', 'http', 'delay', 'playbook',
] as const

const STEP_DESC: Record<string, string> = {
  shell: '执行本地命令',
  ssh: 'SSH 远程执行',
  agent: 'AI 智能体执行',
  approval: '人工审批门控',
  condition: '条件分支',
  parallel: '并行执行',
  notify: '发送通知',
  http: 'HTTP 请求',
  delay: '延时等待',
  playbook: '调用剧本',
}

export const StepPalette = memo(function StepPalette() {
  const onDragStart = useCallback((e: React.DragEvent, stepType: string) => {
    e.dataTransfer.setData('application/pipeline-step', stepType)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  return (
    <div className="flex flex-col items-center gap-1 py-2 w-12 bg-white/70 dark:bg-black/50 backdrop-blur-sm border-r border-border shrink-0">
      {STEP_TYPES.map((type) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => onDragStart(e, type)}
          className="group relative flex items-center justify-center w-9 h-9 rounded-lg cursor-grab active:cursor-grabbing
            hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title={`${STEP_LABEL[type]} — ${STEP_DESC[type]}`}
        >
          <i
            className={`ti ${STEP_ICON[type]} text-lg`}
            style={{ color: STEP_ACCENT[type] }}
          />
          {/* Tooltip */}
          <div className="pointer-events-none absolute left-full ml-2 hidden group-hover:flex items-center z-50">
            <div className="whitespace-nowrap rounded-lg bg-[#1d1d1f] px-2.5 py-1.5 text-xs text-white shadow-lg">
              <div className="font-medium">{STEP_LABEL[type]}</div>
              <div className="text-white/60 text-[10px]">{STEP_DESC[type]}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pipeline-flow/StepPalette.tsx
git commit -m "feat: add StepPalette — draggable step type toolbar for pipeline editor"
```

---

### Task 4: Property Forms — CommonFields + All 10 Type Forms

**Files:**
- Create: `src/components/pipeline-flow/property-forms/CommonFields.tsx`
- Create: `src/components/pipeline-flow/property-forms/ShellForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/SshForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/AgentForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/ApprovalForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/ConditionForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/ParallelForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/NotifyForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/HttpForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/DelayForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/PlaybookForm.tsx`
- Create: `src/components/pipeline-flow/property-forms/index.ts`

- [ ] **Step 1: Create directory**

```bash
mkdir -p /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/components/pipeline-flow/property-forms
```

- [ ] **Step 2: Create CommonFields.tsx**

Create `src/components/pipeline-flow/property-forms/CommonFields.tsx`:

```tsx
interface CommonFieldsProps {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

const FAILURE_OPTIONS = [
  { value: 'abort', label: '中止' },
  { value: 'skip', label: '跳过' },
  { value: 'retry', label: '重试' },
  { value: 'notify_continue', label: '通知后继续' },
]

const inputCls = 'w-full bg-transparent border-b border-border px-0 py-1.5 text-sm text-text focus:border-accent focus:outline-none'
const labelCls = 'text-[11px] text-text3 uppercase tracking-wider mt-3 mb-0.5 block'
const selectCls = 'w-full bg-transparent border-b border-border px-0 py-1.5 text-sm text-text focus:border-accent focus:outline-none appearance-none'

export function CommonFields({ data, onChange }: CommonFieldsProps) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>步骤 ID</label>
      <input
        className={`${inputCls} text-text3 font-mono text-xs`}
        value={String(data.id ?? '')}
        readOnly
      />

      <label className={labelCls}>名称</label>
      <input
        className={inputCls}
        value={String(data.name ?? '')}
        onChange={(e) => onChange('name', e.target.value)}
        placeholder="步骤名称"
      />

      <label className={labelCls}>超时 (秒)</label>
      <input
        type="number"
        className={inputCls}
        value={Number(data.timeout ?? 30)}
        onChange={(e) => onChange('timeout', Number(e.target.value))}
        min={1}
      />

      <label className={labelCls}>失败策略</label>
      <select
        className={selectCls}
        value={String(data.on_failure ?? 'abort')}
        onChange={(e) => onChange('on_failure', e.target.value)}
      >
        {FAILURE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <label className={labelCls}>重试次数</label>
      <input
        type="number"
        className={inputCls}
        value={Number(data.retry_count ?? 0)}
        onChange={(e) => onChange('retry_count', Number(e.target.value))}
        min={0}
        max={10}
      />

      {Number(data.retry_count ?? 0) > 0 && (
        <>
          <label className={labelCls}>重试间隔 (秒)</label>
          <input
            type="number"
            className={inputCls}
            value={Number(data.retry_delay ?? 5)}
            onChange={(e) => onChange('retry_delay', Number(e.target.value))}
            min={1}
          />
        </>
      )}
    </div>
  )
}

export { inputCls, labelCls, selectCls }
```

- [ ] **Step 3: Create all 10 type-specific forms**

Create each form file. They all follow the same pattern: accept `data` + `onChange` props, render type-specific fields using the shared CSS classes.

Create `src/components/pipeline-flow/property-forms/ShellForm.tsx`:
```tsx
import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function ShellForm({ data, onChange }: Props) {
  return (
    <div>
      <label className={labelCls}>命令</label>
      <textarea
        className={`${inputCls} font-mono text-xs min-h-[80px] resize-y`}
        value={String(data.command ?? '')}
        onChange={(e) => onChange('command', e.target.value)}
        placeholder="echo hello"
      />
    </div>
  )
}
```

Create `src/components/pipeline-flow/property-forms/SshForm.tsx`:
```tsx
import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function SshForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>目标主机</label>
      <input
        className={inputCls}
        value={String(data.host ?? '')}
        onChange={(e) => onChange('host', e.target.value)}
        placeholder="{{params.target_server}}"
      />
      <label className={labelCls}>命令</label>
      <textarea
        className={`${inputCls} font-mono text-xs min-h-[80px] resize-y`}
        value={String(data.command ?? '')}
        onChange={(e) => onChange('command', e.target.value)}
        placeholder="uptime"
      />
    </div>
  )
}
```

Create `src/components/pipeline-flow/property-forms/AgentForm.tsx`:
```tsx
import { inputCls, labelCls, selectCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function AgentForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>提示词</label>
      <textarea
        className={`${inputCls} min-h-[120px] resize-y`}
        value={String(data.prompt ?? '')}
        onChange={(e) => onChange('prompt', e.target.value)}
        placeholder="分析系统状态并生成报告"
      />
      <label className={labelCls}>模型 (可选)</label>
      <input
        className={inputCls}
        value={String(data.model ?? '')}
        onChange={(e) => onChange('model', e.target.value)}
        placeholder="留空使用默认模型"
      />
      <label className={labelCls}>输出格式</label>
      <select
        className={selectCls}
        value={String(data.output_format ?? '')}
        onChange={(e) => onChange('output_format', e.target.value)}
      >
        <option value="">文本</option>
        <option value="json">JSON</option>
      </select>
    </div>
  )
}
```

Create `src/components/pipeline-flow/property-forms/ApprovalForm.tsx`:
```tsx
import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function ApprovalForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>审批人</label>
      <input
        className={inputCls}
        value={String(data.assignee ?? '')}
        onChange={(e) => onChange('assignee', e.target.value)}
        placeholder="admin"
      />
    </div>
  )
}
```

Create `src/components/pipeline-flow/property-forms/ConditionForm.tsx`:
```tsx
import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function ConditionForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>条件表达式</label>
      <input
        className={`${inputCls} font-mono text-xs`}
        value={String(data.expression ?? '')}
        onChange={(e) => onChange('expression', e.target.value)}
        placeholder="{{steps.check.output.severity}} >= 'high'"
      />
      <p className="text-[10px] text-text3 mt-1">
        条件分支的目标步骤由连线自动确定：右侧绿色出口 = 是，左侧红色出口 = 否
      </p>
    </div>
  )
}
```

Create `src/components/pipeline-flow/property-forms/ParallelForm.tsx`:
```tsx
import { labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function ParallelForm({ data }: Props) {
  const branchCount = Number(data.branchCount ?? 0)
  return (
    <div>
      <label className={labelCls}>并行分支</label>
      <p className="text-sm text-text2">当前 {branchCount} 个分支</p>
      <p className="text-[10px] text-text3 mt-1">
        从此节点拖出连线到其他步骤即可添加并行分支。每条出线代表一个并行分支。
      </p>
    </div>
  )
}
```

Create `src/components/pipeline-flow/property-forms/NotifyForm.tsx`:
```tsx
import { inputCls, labelCls, selectCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function NotifyForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>通知渠道</label>
      <select
        className={selectCls}
        value={String(data.channel ?? 'telegram')}
        onChange={(e) => onChange('channel', e.target.value)}
      >
        <option value="telegram">Telegram</option>
        <option value="email">邮件</option>
        <option value="webhook">Webhook</option>
      </select>
      <label className={labelCls}>消息内容</label>
      <textarea
        className={`${inputCls} min-h-[80px] resize-y`}
        value={String(data.message ?? '')}
        onChange={(e) => onChange('message', e.target.value)}
        placeholder="任务完成通知"
      />
    </div>
  )
}
```

Create `src/components/pipeline-flow/property-forms/HttpForm.tsx`:
```tsx
import { inputCls, labelCls, selectCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function HttpForm({ data, onChange }: Props) {
  return (
    <div className="space-y-0.5">
      <label className={labelCls}>URL</label>
      <input
        className={`${inputCls} font-mono text-xs`}
        value={String(data.url ?? '')}
        onChange={(e) => onChange('url', e.target.value)}
        placeholder="https://api.example.com/webhook"
      />
      <label className={labelCls}>方法</label>
      <select
        className={selectCls}
        value={String(data.method ?? 'GET')}
        onChange={(e) => onChange('method', e.target.value)}
      >
        <option value="GET">GET</option>
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="DELETE">DELETE</option>
      </select>
      <label className={labelCls}>请求体</label>
      <textarea
        className={`${inputCls} font-mono text-xs min-h-[60px] resize-y`}
        value={String(data.body ?? '')}
        onChange={(e) => onChange('body', e.target.value)}
        placeholder='{"key": "value"}'
      />
    </div>
  )
}
```

Create `src/components/pipeline-flow/property-forms/DelayForm.tsx`:
```tsx
import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function DelayForm({ data, onChange }: Props) {
  return (
    <div>
      <label className={labelCls}>等待时间 (秒)</label>
      <input
        type="number"
        className={inputCls}
        value={Number(data.seconds ?? 30)}
        onChange={(e) => onChange('seconds', Number(e.target.value))}
        min={1}
      />
    </div>
  )
}
```

Create `src/components/pipeline-flow/property-forms/PlaybookForm.tsx`:
```tsx
import { inputCls, labelCls } from './CommonFields'

interface Props {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export function PlaybookForm({ data, onChange }: Props) {
  return (
    <div>
      <label className={labelCls}>剧本 ID</label>
      <input
        className={`${inputCls} font-mono text-xs`}
        value={String(data.playbook_id ?? '')}
        onChange={(e) => onChange('playbook_id', e.target.value)}
        placeholder="system-init-template"
      />
    </div>
  )
}
```

- [ ] **Step 4: Create the form registry index.ts**

Create `src/components/pipeline-flow/property-forms/index.ts`:

```ts
import type { ComponentType } from 'react'
import { ShellForm } from './ShellForm'
import { SshForm } from './SshForm'
import { AgentForm } from './AgentForm'
import { ApprovalForm } from './ApprovalForm'
import { ConditionForm } from './ConditionForm'
import { ParallelForm } from './ParallelForm'
import { NotifyForm } from './NotifyForm'
import { HttpForm } from './HttpForm'
import { DelayForm } from './DelayForm'
import { PlaybookForm } from './PlaybookForm'

interface FormProps {
  data: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
}

export const STEP_FORMS: Record<string, ComponentType<FormProps>> = {
  shell: ShellForm,
  ssh: SshForm,
  agent: AgentForm,
  approval: ApprovalForm,
  condition: ConditionForm,
  parallel: ParallelForm,
  notify: NotifyForm,
  http: HttpForm,
  delay: DelayForm,
  playbook: PlaybookForm,
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add src/components/pipeline-flow/property-forms/
git commit -m "feat: add property forms — CommonFields + 10 step-type-specific form components"
```

---

### Task 5: PropertyPanel — Right Drawer

**Files:**
- Create: `src/components/pipeline-flow/PropertyPanel.tsx`

- [ ] **Step 1: Create the PropertyPanel component**

Create `src/components/pipeline-flow/PropertyPanel.tsx`:

```tsx
import { memo, useCallback, useEffect } from 'react'
import type { Node } from '@xyflow/react'
import { STEP_ACCENT, STEP_ICON, STEP_LABEL } from './nodes'
import { CommonFields } from './property-forms/CommonFields'
import { STEP_FORMS } from './property-forms'

interface PropertyPanelProps {
  node: Node | null
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export const PropertyPanel = memo(function PropertyPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: PropertyPanelProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      if (!node) return
      onUpdate(node.id, { [field]: value })
    },
    [node, onUpdate],
  )

  const handleDelete = useCallback(() => {
    if (!node) return
    if (confirm(`确定删除步骤「${(node.data as Record<string, unknown>).name ?? node.id}」？`)) {
      onDelete(node.id)
    }
  }, [node, onDelete])

  const type = (node?.data as Record<string, unknown>)?.type as string ?? ''
  const TypeForm = type ? STEP_FORMS[type] : null

  return (
    <div
      className={`
        absolute top-0 right-0 h-full w-[320px] z-20
        bg-white/95 dark:bg-[#1a1a2e]/95 backdrop-blur-md
        border-l border-border
        transition-transform duration-200 ease-out
        overflow-y-auto
        ${node ? 'translate-x-0' : 'translate-x-full'}
      `}
      style={{ boxShadow: node ? '-2px 0 20px rgba(0,0,0,0.1)' : 'none' }}
    >
      {node && (
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <i
                className={`ti ${STEP_ICON[type] ?? 'ti-point'} text-lg`}
                style={{ color: STEP_ACCENT[type] ?? '#6b7280' }}
              />
              <span className="text-sm font-semibold text-text">
                {STEP_LABEL[type] ?? type}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-full text-text3 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <i className="ti ti-x text-sm" />
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-border mb-3" />

          {/* Common fields */}
          <CommonFields
            data={node.data as Record<string, unknown>}
            onChange={handleChange}
          />

          {/* Divider */}
          <div className="border-t border-border my-3" />

          {/* Type-specific form */}
          {TypeForm && (
            <TypeForm
              data={node.data as Record<string, unknown>}
              onChange={handleChange}
            />
          )}

          {/* Delete button */}
          <div className="border-t border-border mt-6 pt-4">
            <button
              type="button"
              onClick={handleDelete}
              className="w-full py-2 rounded-lg text-sm font-medium text-red bg-red/10 hover:bg-red/20 transition-colors"
            >
              删除此步骤
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pipeline-flow/PropertyPanel.tsx
git commit -m "feat: add PropertyPanel — right drawer with dynamic step-type forms"
```

---

### Task 6: Node Selection Highlight

**Files:**
- Modify: `src/components/pipeline-flow/nodes/BaseStepNode.tsx`
- Modify: `src/components/pipeline-flow/nodes/ConditionNode.tsx`
- Modify: `src/components/pipeline-flow/nodes/ParallelNode.tsx`

- [ ] **Step 1: Add `selected` prop to BaseStepNode**

In `BaseStepNode.tsx`, change the component signature from:

```tsx
export const BaseStepNode = memo(function BaseStepNode({ data }: NodeProps) {
```

to:

```tsx
export const BaseStepNode = memo(function BaseStepNode({ data, selected }: NodeProps) {
```

And update the outer div className to add selection ring:

Find:
```tsx
        ${ring}
        ${isPendingOrSkipped ? 'opacity-50' : ''}
```

Replace with:
```tsx
        ${selected ? 'shadow-[0_0_0_2px_#0071e3] scale-[1.02]' : ring}
        ${isPendingOrSkipped && !selected ? 'opacity-50' : ''}
```

- [ ] **Step 2: Add `selected` prop to ConditionNode**

In `ConditionNode.tsx`, change the component signature to accept `selected`:

```tsx
export const ConditionNode = memo(function ConditionNode({ data, selected }: NodeProps) {
```

And update the diamond div className:

Find:
```tsx
          ${ring}
```

Replace with:
```tsx
          ${selected ? 'shadow-[0_0_0_2px_#0071e3] scale-[1.02]' : ring}
```

- [ ] **Step 3: Add `selected` prop to ParallelNode**

In `ParallelNode.tsx`, same pattern:

```tsx
export const ParallelNode = memo(function ParallelNode({ data, selected }: NodeProps) {
```

Find:
```tsx
        ${ring}
        ${isPendingOrSkipped ? 'opacity-50' : ''}
```

Replace with:
```tsx
        ${selected ? 'shadow-[0_0_0_2px_#0071e3] scale-[1.02]' : ring}
        ${isPendingOrSkipped && !selected ? 'opacity-50' : ''}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/pipeline-flow/nodes/
git commit -m "feat: add selection highlight (Apple Blue ring) to all pipeline node types"
```

---

### Task 7: PipelineFlowView — Edit Mode Integration

**Files:**
- Modify: `src/components/pipeline-flow/PipelineFlowView.tsx`

- [ ] **Step 1: Rewrite PipelineFlowView to support edit mode**

Replace the entire content of `PipelineFlowView.tsx` with:

```tsx
import { useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useThemeStore } from '@/stores/themeStore'
import type { Pipeline } from '@/api/pipelines'
import { nodeTypes, STEP_ACCENT } from './nodes'
import { useYamlToFlow } from './useYamlToFlow'
import { useRunStatusOverlay } from './useRunStatusOverlay'
import { useFlowEditor, type FlowEditorReturn } from './useFlowEditor'
import { flowToYaml } from './useFlowToYaml'
import { StepPalette } from './StepPalette'
import { PropertyPanel } from './PropertyPanel'

interface PipelineFlowViewProps {
  pipeline: Pipeline | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stepEvents?: Map<string, any>
  className?: string
  // Edit mode props
  editable?: boolean
  editorContent?: string
  onEditorContentChange?: (yaml: string) => void
  onDirtyChange?: (dirty: boolean) => void
}

function FlowCanvas({
  pipeline,
  stepEvents,
  editable = false,
  editorContent,
  onEditorContentChange,
  onDirtyChange,
}: PipelineFlowViewProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { fitView, screenToFlowPosition } = useReactFlow()
  const editor = useFlowEditor()
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedContentRef = useRef<string>('')

  // Load from YAML when entering edit mode or when editorContent changes externally
  useEffect(() => {
    if (!editable) return
    const content = editorContent ?? pipeline?.steps_json
    if (!content || content === loadedContentRef.current) return
    loadedContentRef.current = content

    // Parse using the existing useYamlToFlow logic
    const stepsJson = editorContent ? null : pipeline?.steps_json
    if (stepsJson) {
      const { nodes, edges } = yamlToFlowStatic(stepsJson)
      editor.loadFromSteps(nodes, edges)
    }
  }, [editable, editorContent, pipeline?.steps_json])

  // Sync visual changes → YAML (debounced)
  useEffect(() => {
    if (!editable || !onEditorContentChange || !editor.dirty) return

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      const yaml = flowToYaml(editor.nodes, editor.edges, {
        name: pipeline?.name,
        display_name: pipeline?.display_name,
        description: pipeline?.description,
        version: pipeline?.version,
      })
      loadedContentRef.current = yaml
      onEditorContentChange(yaml)
    }, 500)

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [editable, editor.nodes, editor.edges, editor.dirty, onEditorContentChange, pipeline])

  // Report dirty state
  useEffect(() => {
    onDirtyChange?.(editor.dirty)
  }, [editor.dirty, onDirtyChange])

  // Read-only mode: use Phase 1 logic
  const { nodes: readOnlyNodes, edges: readOnlyEdges } = useYamlToFlow(
    editable ? null : pipeline?.steps_json,
  )
  const { nodes: statusNodes, edges: statusEdges } = useRunStatusOverlay(
    editable ? editor.nodes : readOnlyNodes,
    editable ? editor.edges : readOnlyEdges,
    stepEvents,
  )

  const nodes = editable && !stepEvents ? editor.nodes : statusNodes
  const edges = editable && !stepEvents ? editor.edges : statusEdges

  // Handlers
  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => {
      if (editable) editor.selectNode(node.id)
    },
    [editable, editor],
  )

  const handlePaneClick = useCallback(() => {
    if (editable) editor.selectNode(null)
  }, [editable, editor])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const stepType = e.dataTransfer.getData('application/pipeline-step')
      if (!stepType) return
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      editor.addNode(stepType, position)
    },
    [screenToFlowPosition, editor],
  )

  // Empty states
  if (!pipeline) {
    return (
      <div className="flex flex-1 items-center justify-center text-text3">
        <div className="text-center">
          <i className="ti ti-topology-star-3 mb-3 block text-4xl" />
          <p className="text-sm">选择一个 Pipeline 查看可视化</p>
        </div>
      </div>
    )
  }

  if (!editable && nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-text3">
        <div className="text-center">
          <i className="ti ti-alert-circle mb-3 block text-4xl" />
          <p className="text-sm">无法解析步骤数据</p>
        </div>
      </div>
    )
  }

  const selectedNode = editable
    ? editor.nodes.find((n) => n.id === editor.selectedNodeId) ?? null
    : null

  return (
    <div className="relative h-full w-full flex">
      {/* Step palette (edit mode only) */}
      {editable && <StepPalette />}

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode={isDark ? 'dark' : 'light'}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={editable}
          nodesConnectable={editable}
          elementsSelectable={editable}
          panOnDrag
          zoomOnScroll
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          onConnect={editable ? editor.onConnect : undefined}
          onNodesChange={editable ? editor.onNodesChange : undefined}
          onEdgesChange={editable ? editor.onEdgesChange : undefined}
          onDragOver={editable ? handleDragOver : undefined}
          onDrop={editable ? handleDrop : undefined}
          defaultEdgeOptions={{
            type: 'smoothstep',
            style: {
              stroke: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
              strokeWidth: 1.5,
            },
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
          />
          <Controls
            showInteractive={false}
            className="!rounded-lg !border-none"
            style={{
              background: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(12px)',
              borderRadius: 8,
            }}
          />
          <MiniMap
            nodeColor={(node) => STEP_ACCENT[node.type ?? ''] ?? '#6b7280'}
            maskColor={isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'}
            style={{
              background: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(12px)',
              borderRadius: 8,
              width: 120,
              height: 80,
            }}
          />
          <Panel position="top-right">
            <button
              type="button"
              onClick={handleFitView}
              className="rounded-full px-3 py-1 text-xs font-medium
                bg-white/80 dark:bg-black/60 text-[#1d1d1f] dark:text-white
                backdrop-blur-sm hover:bg-white dark:hover:bg-black/80
                transition-colors"
              style={{ borderRadius: 980 }}
            >
              适配视图
            </button>
          </Panel>
        </ReactFlow>

        {/* Property panel (edit mode only) */}
        {editable && (
          <PropertyPanel
            node={selectedNode}
            onUpdate={editor.updateNodeData}
            onDelete={editor.removeNode}
            onClose={() => editor.selectNode(null)}
          />
        )}
      </div>
    </div>
  )
}

// Static version of useYamlToFlow for imperative calls
function yamlToFlowStatic(stepsJson: string) {
  // Reuse the same parsing logic
  const mod = require('./useYamlToFlow')
  // Fallback: just return empty if module not available
  try {
    if (typeof mod.useYamlToFlow === 'function') {
      // Can't call hook outside component, use the raw parse
    }
  } catch { /* ignore */ }
  return { nodes: [] as import('@xyflow/react').Node[], edges: [] as import('@xyflow/react').Edge[] }
}

export default function PipelineFlowView(props: PipelineFlowViewProps) {
  return (
    <div className={`h-full w-full ${props.className ?? ''}`}>
      <ReactFlowProvider>
        <FlowCanvas {...props} />
      </ReactFlowProvider>
    </div>
  )
}
```

**IMPORTANT:** The `yamlToFlowStatic` function above is a placeholder. We need to extract the pure functions from `useYamlToFlow.ts` so they can be called imperatively. Add these exports to `useYamlToFlow.ts`:

At the bottom of `useYamlToFlow.ts`, add:

```ts
// Export pure functions for imperative use
export { buildFlowElements, applyDagreLayout, parseStepsJson }
```

Then update `yamlToFlowStatic` in `PipelineFlowView.tsx` to:

```ts
import { parseStepsJson, buildFlowElements, applyDagreLayout } from './useYamlToFlow'

function yamlToFlowStatic(stepsJson: string) {
  const steps = parseStepsJson(stepsJson)
  if (steps.length === 0) return { nodes: [], edges: [] }
  const { nodes, edges } = buildFlowElements(steps)
  return applyDagreLayout(nodes, edges)
}
```

- [ ] **Step 2: Export pure functions from useYamlToFlow.ts**

In `useYamlToFlow.ts`, change `function parseStepsJson`, `function buildFlowElements`, and `function applyDagreLayout` from private functions to exported:

Change `function parseStepsJson(` → `export function parseStepsJson(`
Change `function buildFlowElements(` → `export function buildFlowElements(`
Change `function applyDagreLayout(` → `export function applyDagreLayout(`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/components/pipeline-flow/PipelineFlowView.tsx src/components/pipeline-flow/useYamlToFlow.ts
git commit -m "feat: upgrade PipelineFlowView to edit mode — palette, property panel, drag-and-drop"
```

---

### Task 8: PipelinesPage — Bidirectional Sync Integration

**Files:**
- Modify: `src/pages/PipelinesPage.tsx`

- [ ] **Step 1: Update the visual tab content in PipelinesPage**

Find the existing visual tab block (around line 823-830):

```tsx
              {detailTab === 'visual' && (
                <Suspense fallback={<div className="flex flex-1 items-center justify-center text-text3 text-sm">加载可视化组件...</div>}>
                  <PipelineFlowView
                    pipeline={selectedPipeline}
                    stepEvents={activeRunId ? stepEvents : undefined}
                  />
                </Suspense>
              )}
```

Replace with:

```tsx
              {detailTab === 'visual' && (
                <Suspense fallback={<div className="flex flex-1 items-center justify-center text-text3 text-sm">加载可视化组件...</div>}>
                  <PipelineFlowView
                    pipeline={selectedPipeline}
                    stepEvents={activeRunId ? stepEvents : undefined}
                    editable={!activeRunId}
                    editorContent={editorContent}
                    onEditorContentChange={(yaml) => {
                      setEditorContent(yaml)
                      setEditorDirty(true)
                    }}
                    onDirtyChange={(d) => { if (d) setEditorDirty(true) }}
                  />
                </Suspense>
              )}
```

This connects the visual editor to the same `editorContent` and `editorDirty` state that the YAML edit tab uses. When the user is watching a running pipeline (`activeRunId` is set), the canvas falls back to read-only mode with status overlay.

- [ ] **Step 2: Verify build**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/PipelinesPage.tsx
git commit -m "feat: integrate pipeline visual editor with bidirectional YAML sync"
```

---

### Task 9: Build Verification + Final Cleanup

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit 2>&1 | tail -10
```

Expected: exit 0, no errors

- [ ] **Step 2: Production build**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npm run build 2>&1 | tail -10
```

Expected: "built in Xs" with no errors

- [ ] **Step 3: Verify all files tracked**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && git status
```

If any unstaged files in `pipeline-flow/`:

```bash
git add src/components/pipeline-flow/
git commit -m "chore: ensure all Phase 2 pipeline editor files are tracked"
```
