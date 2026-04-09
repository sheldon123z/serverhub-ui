# Pipeline React Flow Visualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive React Flow "Visual" tab to the Pipeline page that renders steps as styled nodes with runtime status animation.

**Architecture:** New `components/pipeline-flow/` directory containing the flow view component, custom node components, data conversion hooks, and status overlay logic. The existing `PipelinesPage.tsx` gains a 4th tab that renders `PipelineFlowView`. No backend changes.

**Tech Stack:** @xyflow/react, @dagrejs/dagre, React 19, TypeScript, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/pipeline-flow/nodes/index.ts` | nodeTypes registry + shared constants (accent colors, icons) |
| Create | `src/components/pipeline-flow/nodes/BaseStepNode.tsx` | Rectangular node for 8 step types (shell/ssh/agent/approval/notify/http/delay/playbook) |
| Create | `src/components/pipeline-flow/nodes/ConditionNode.tsx` | Diamond-shaped node with dual output handles |
| Create | `src/components/pipeline-flow/nodes/ParallelNode.tsx` | Double-border node with multi output handles |
| Create | `src/components/pipeline-flow/useYamlToFlow.ts` | steps_json → React Flow nodes/edges + Dagre layout |
| Create | `src/components/pipeline-flow/useRunStatusOverlay.ts` | SSE stepEvents → node/edge style overrides |
| Create | `src/components/pipeline-flow/PipelineFlowView.tsx` | Main wrapper: ReactFlowProvider + canvas + controls |
| Modify | `src/pages/PipelinesPage.tsx:480,764-827` | Add 'visual' tab type + tab button + tab content panel |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @xyflow/react and @dagrejs/dagre**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui
npm install @xyflow/react @dagrejs/dagre
```

- [ ] **Step 2: Install dagre types**

```bash
npm install -D @types/dagre
```

- [ ] **Step 3: Verify installation**

```bash
ls node_modules/@xyflow/react/package.json && ls node_modules/@dagrejs/dagre/package.json && echo "OK"
```

Expected: Both paths exist, prints "OK"

- [ ] **Step 4: Verify build still works**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit 2>&1 | tail -5
```

Expected: No new errors from the install

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @xyflow/react and @dagrejs/dagre dependencies for pipeline visualization"
```

---

### Task 2: Node Types Registry + Shared Constants

**Files:**
- Create: `src/components/pipeline-flow/nodes/index.ts`

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/components/pipeline-flow/nodes
mkdir -p /home/zhengxiaodong/exps/serverhub/serverhub-ui/src/components/pipeline-flow/edges
```

- [ ] **Step 2: Create the constants and registry file**

Create `src/components/pipeline-flow/nodes/index.ts`:

```ts
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
  notify: BaseStepNode,
  http: BaseStepNode,
  delay: BaseStepNode,
  playbook: BaseStepNode,
  condition: ConditionNode,
  parallel: ParallelNode,
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline-flow/nodes/index.ts
git commit -m "feat: add pipeline flow node types registry and visual constants"
```

---

### Task 3: BaseStepNode Component

**Files:**
- Create: `src/components/pipeline-flow/nodes/BaseStepNode.tsx`

- [ ] **Step 1: Create the BaseStepNode component**

Create `src/components/pipeline-flow/nodes/BaseStepNode.tsx`:

```tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { STEP_ACCENT, STEP_ICON, STEP_LABEL } from './index'

export interface BaseStepNodeData {
  name: string
  type: string
  runStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  [key: string]: unknown
}

const STATUS_RING: Record<string, string> = {
  running: 'shadow-[0_0_0_2px_#0071e3,0_0_12px_rgba(0,122,227,0.4)] animate-pulse',
  completed: 'shadow-[0_0_0_2px_#22c55e]',
  failed: 'shadow-[0_0_0_2px_#ef4444]',
}

const STATUS_BADGE: Record<string, { bg: string; icon: string }> = {
  running: { bg: 'bg-[#0071e3]', icon: 'ti-loader animate-spin' },
  completed: { bg: 'bg-[#22c55e]', icon: 'ti-check' },
  failed: { bg: 'bg-[#ef4444]', icon: 'ti-x' },
}

export const BaseStepNode = memo(function BaseStepNode({ data }: NodeProps) {
  const d = data as BaseStepNodeData
  const accent = STEP_ACCENT[d.type] ?? '#6b7280'
  const icon = STEP_ICON[d.type] ?? 'ti-point'
  const label = STEP_LABEL[d.type] ?? d.type
  const status = d.runStatus
  const isPendingOrSkipped = status === 'pending' || status === 'skipped'
  const badge = status ? STATUS_BADGE[status] : undefined
  const ring = status ? STATUS_RING[status] ?? '' : ''

  return (
    <div
      className={`
        relative w-[180px] rounded-lg bg-white dark:bg-[#272729]
        transition-all duration-300
        ${ring}
        ${isPendingOrSkipped ? 'opacity-50' : ''}
      `}
      style={{
        boxShadow: ring ? undefined : '0 2px 12px rgba(0,0,0,0.08)',
      }}
    >
      {/* Accent left strip */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg"
        style={{ backgroundColor: accent }}
      />

      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-300 dark:!bg-gray-600 !border-2 !border-white dark:!border-[#272729]"
      />

      {/* Content */}
      <div className="flex items-center gap-2.5 py-2.5 pl-4 pr-3">
        <i
          className={`ti ${icon} text-base`}
          style={{ color: accent }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[#1d1d1f] dark:text-[#e2e8f0] leading-tight">
            {d.name}
          </div>
          <div className="text-[11px] text-black/40 dark:text-white/40 leading-tight mt-0.5">
            {label}
          </div>
        </div>
      </div>

      {/* Status badge */}
      {badge && (
        <div className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full ${badge.bg} flex items-center justify-center`}>
          <i className={`ti ${badge.icon} text-white text-[10px]`} />
        </div>
      )}

      {/* Source handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-gray-300 dark:!bg-gray-600 !border-2 !border-white dark:!border-[#272729]"
      />
    </div>
  )
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit 2>&1 | grep -i "BaseStepNode" || echo "No errors"
```

Expected: "No errors"

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline-flow/nodes/BaseStepNode.tsx
git commit -m "feat: add BaseStepNode component for 8 pipeline step types"
```

---

### Task 4: ConditionNode Component

**Files:**
- Create: `src/components/pipeline-flow/nodes/ConditionNode.tsx`

- [ ] **Step 1: Create the ConditionNode component**

Create `src/components/pipeline-flow/nodes/ConditionNode.tsx`:

```tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

interface ConditionNodeData {
  name: string
  type: string
  expression?: string
  runStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  [key: string]: unknown
}

const STATUS_RING: Record<string, string> = {
  running: 'shadow-[0_0_0_2px_#0071e3,0_0_12px_rgba(0,122,227,0.4)] animate-pulse',
  completed: 'shadow-[0_0_0_2px_#22c55e]',
  failed: 'shadow-[0_0_0_2px_#ef4444]',
}

const STATUS_BADGE: Record<string, { bg: string; icon: string }> = {
  running: { bg: 'bg-[#0071e3]', icon: 'ti-loader animate-spin' },
  completed: { bg: 'bg-[#22c55e]', icon: 'ti-check' },
  failed: { bg: 'bg-[#ef4444]', icon: 'ti-x' },
}

export const ConditionNode = memo(function ConditionNode({ data }: NodeProps) {
  const d = data as ConditionNodeData
  const status = d.runStatus
  const isPendingOrSkipped = status === 'pending' || status === 'skipped'
  const badge = status ? STATUS_BADGE[status] : undefined
  const ring = status ? STATUS_RING[status] ?? '' : ''

  return (
    <div
      className={`relative flex items-center justify-center ${isPendingOrSkipped ? 'opacity-50' : ''}`}
      style={{ width: 142, height: 142 }}
    >
      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-300 dark:!bg-gray-600 !border-2 !border-white dark:!border-[#1a1a2e]"
      />

      {/* Diamond shape */}
      <div
        className={`
          w-[100px] h-[100px] rotate-45
          bg-white dark:bg-[#272729]
          rounded-lg
          transition-all duration-300
          ${ring}
        `}
        style={{
          boxShadow: ring ? undefined : '0 2px 12px rgba(0,0,0,0.08)',
        }}
      >
        {/* Inner content (counter-rotate to keep text upright) */}
        <div className="-rotate-45 flex flex-col items-center justify-center w-full h-full p-1">
          <i className="ti ti-git-branch text-base text-[#3b82f6] mb-0.5" />
          <div className="text-[11px] font-semibold text-[#1d1d1f] dark:text-[#e2e8f0] text-center leading-tight truncate max-w-[80px]">
            {d.name}
          </div>
        </div>
      </div>

      {/* Status badge */}
      {badge && (
        <div className={`absolute top-0 right-0 w-4 h-4 rounded-full ${badge.bg} flex items-center justify-center z-10`}>
          <i className={`ti ${badge.icon} text-white text-[10px]`} />
        </div>
      )}

      {/* Source handle: True (right) */}
      <Handle
        type="source"
        position={Position.Right}
        id="handle-true"
        className="!w-2 !h-2 !bg-[#22c55e] !border-2 !border-white dark:!border-[#1a1a2e]"
      />
      <span className="absolute right-[-20px] top-1/2 -translate-y-1/2 text-[10px] font-medium text-[#22c55e]">
        是
      </span>

      {/* Source handle: False (left) */}
      <Handle
        type="source"
        position={Position.Left}
        id="handle-false"
        className="!w-2 !h-2 !bg-[#ef4444] !border-2 !border-white dark:!border-[#1a1a2e]"
      />
      <span className="absolute left-[-20px] top-1/2 -translate-y-1/2 text-[10px] font-medium text-[#ef4444]">
        否
      </span>
    </div>
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pipeline-flow/nodes/ConditionNode.tsx
git commit -m "feat: add ConditionNode diamond component with true/false handles"
```

---

### Task 5: ParallelNode Component

**Files:**
- Create: `src/components/pipeline-flow/nodes/ParallelNode.tsx`

- [ ] **Step 1: Create the ParallelNode component**

Create `src/components/pipeline-flow/nodes/ParallelNode.tsx`:

```tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

interface ParallelNodeData {
  name: string
  type: string
  branchCount?: number
  runStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  [key: string]: unknown
}

const STATUS_RING: Record<string, string> = {
  running: 'shadow-[0_0_0_2px_#0071e3,0_0_12px_rgba(0,122,227,0.4)] animate-pulse',
  completed: 'shadow-[0_0_0_2px_#22c55e]',
  failed: 'shadow-[0_0_0_2px_#ef4444]',
}

const STATUS_BADGE: Record<string, { bg: string; icon: string }> = {
  running: { bg: 'bg-[#0071e3]', icon: 'ti-loader animate-spin' },
  completed: { bg: 'bg-[#22c55e]', icon: 'ti-check' },
  failed: { bg: 'bg-[#ef4444]', icon: 'ti-x' },
}

export const ParallelNode = memo(function ParallelNode({ data }: NodeProps) {
  const d = data as ParallelNodeData
  const status = d.runStatus
  const isPendingOrSkipped = status === 'pending' || status === 'skipped'
  const badge = status ? STATUS_BADGE[status] : undefined
  const ring = status ? STATUS_RING[status] ?? '' : ''
  const branchCount = d.branchCount ?? 2

  return (
    <div
      className={`
        relative w-[180px] rounded-lg bg-white dark:bg-[#272729]
        transition-all duration-300
        ${ring}
        ${isPendingOrSkipped ? 'opacity-50' : ''}
      `}
      style={{
        boxShadow: ring
          ? undefined
          : '0 2px 12px rgba(0,0,0,0.08), inset 0 0 0 2px rgba(16,185,129,0.2)',
      }}
    >
      {/* Accent left strip */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-[#10b981]" />

      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-gray-300 dark:!bg-gray-600 !border-2 !border-white dark:!border-[#272729]"
      />

      {/* Content */}
      <div className="flex items-center gap-2.5 py-2.5 pl-4 pr-3">
        <i className="ti ti-arrows-split text-base text-[#10b981]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-[#1d1d1f] dark:text-[#e2e8f0] leading-tight">
            {d.name}
          </div>
          <div className="text-[11px] text-black/40 dark:text-white/40 leading-tight mt-0.5">
            并行 · {branchCount} 分支
          </div>
        </div>
      </div>

      {/* Status badge */}
      {badge && (
        <div className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full ${badge.bg} flex items-center justify-center`}>
          <i className={`ti ${badge.icon} text-white text-[10px]`} />
        </div>
      )}

      {/* Source handle (bottom) — single output, branches are separate nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-[#10b981] !border-2 !border-white dark:!border-[#272729]"
      />
    </div>
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pipeline-flow/nodes/ParallelNode.tsx
git commit -m "feat: add ParallelNode component with double-border style"
```

---

### Task 6: useYamlToFlow Hook

**Files:**
- Create: `src/components/pipeline-flow/useYamlToFlow.ts`

- [ ] **Step 1: Create the YAML-to-Flow conversion hook**

Create `src/components/pipeline-flow/useYamlToFlow.ts`:

```ts
import { useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import type { StepDefinition } from '@/api/pipelines'
import { STEP_ACCENT, STEP_ICON } from './nodes'

const NODE_WIDTH = 180
const NODE_HEIGHT = 52
const CONDITION_SIZE = 142

function parseStepsJson(raw: string | null | undefined): StepDefinition[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

interface FlowResult {
  nodes: Node[]
  edges: Edge[]
}

function buildFlowElements(steps: StepDefinition[]): FlowResult {
  if (steps.length === 0) return { nodes: [], edges: [] }

  const nodes: Node[] = []
  const edges: Edge[] = []

  // Flatten parallel branches into the node list
  // Track: parallel step id → branch step ids (for fan-out edges)
  const parallelBranches = new Map<string, string[][]>()

  for (const step of steps) {
    const isCondition = step.type === 'condition'
    const isParallel = step.type === 'parallel'

    // Main node
    nodes.push({
      id: step.id,
      type: step.type,
      position: { x: 0, y: 0 }, // Dagre fills this
      data: {
        name: step.name ?? step.id,
        type: step.type,
        icon: STEP_ICON[step.type] ?? 'ti-point',
        accent: STEP_ACCENT[step.type] ?? '#6b7280',
        command: step.command,
        prompt: step.prompt,
        expression: step.expression,
        branchCount: isParallel
          ? ((step as Record<string, unknown>).branches as unknown[])?.length ?? 0
          : undefined,
      },
    })

    // Parallel: flatten branches into separate nodes + track connections
    if (isParallel) {
      const branches = (step as Record<string, unknown>).branches as StepDefinition[][] | StepDefinition[] | undefined
      if (Array.isArray(branches) && branches.length > 0) {
        const branchIds: string[][] = []

        for (const branch of branches) {
          // Branch can be a single step or array of steps
          const branchSteps = Array.isArray(branch) ? (branch.length > 0 && typeof branch[0] === 'object' && 'id' in branch[0] ? branch : [branch]) : [branch]
          const flatBranch = (branchSteps as StepDefinition[]).filter(s => s && typeof s === 'object' && 'id' in s)
          
          const ids: string[] = []
          for (const bs of flatBranch) {
            ids.push(bs.id)
            nodes.push({
              id: bs.id,
              type: bs.type ?? 'shell',
              position: { x: 0, y: 0 },
              data: {
                name: bs.name ?? bs.id,
                type: bs.type ?? 'shell',
                icon: STEP_ICON[bs.type ?? 'shell'] ?? 'ti-point',
                accent: STEP_ACCENT[bs.type ?? 'shell'] ?? '#6b7280',
                command: bs.command,
              },
            })
          }
          // Internal branch edges
          for (let j = 0; j < ids.length - 1; j++) {
            edges.push({
              id: `e-${ids[j]}-${ids[j + 1]}`,
              source: ids[j],
              target: ids[j + 1],
              type: 'smoothstep',
            })
          }
          if (ids.length > 0) branchIds.push(ids)
        }
        parallelBranches.set(step.id, branchIds)
      }
    }
  }

  // Build edges from step sequence
  // Only iterate the top-level steps (not branch sub-steps)
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const nextStep = i + 1 < steps.length ? steps[i + 1] : null

    if (step.type === 'condition') {
      // Condition: connect to on_true and on_false targets
      const onTrue = (step as Record<string, unknown>).on_true as string | undefined
      const onFalse = (step as Record<string, unknown>).on_false as string | undefined
      if (onTrue) {
        edges.push({
          id: `e-${step.id}-true-${onTrue}`,
          source: step.id,
          sourceHandle: 'handle-true',
          target: onTrue,
          type: 'smoothstep',
          label: '是',
          style: { stroke: '#22c55e' },
        })
      }
      if (onFalse) {
        edges.push({
          id: `e-${step.id}-false-${onFalse}`,
          source: step.id,
          sourceHandle: 'handle-false',
          target: onFalse,
          type: 'smoothstep',
          label: '否',
          style: { stroke: '#ef4444' },
        })
      }
    } else if (step.type === 'parallel') {
      // Parallel: fan-out from parallel node to each branch's first step
      const branchIds = parallelBranches.get(step.id) ?? []
      for (const branch of branchIds) {
        if (branch.length > 0) {
          edges.push({
            id: `e-${step.id}-fork-${branch[0]}`,
            source: step.id,
            target: branch[0],
            type: 'smoothstep',
            animated: false,
          })
        }
      }
      // Fan-in: each branch's last step → next step
      if (nextStep) {
        for (const branch of branchIds) {
          if (branch.length > 0) {
            edges.push({
              id: `e-${branch[branch.length - 1]}-join-${nextStep.id}`,
              source: branch[branch.length - 1],
              target: nextStep.id,
              type: 'smoothstep',
            })
          }
        }
      }
    } else {
      // Linear: connect to next step (skip if the previous step was parallel, as fan-in handles it)
      if (nextStep && steps[i - 1]?.type !== 'parallel') {
        edges.push({
          id: `e-${step.id}-${nextStep.id}`,
          source: step.id,
          target: nextStep.id,
          type: 'smoothstep',
        })
      }
    }
  }

  return { nodes, edges }
}

function applyDagreLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70, marginx: 20, marginy: 20 })

  for (const node of nodes) {
    const isCondition = node.type === 'condition'
    g.setNode(node.id, {
      width: isCondition ? CONDITION_SIZE : NODE_WIDTH,
      height: isCondition ? CONDITION_SIZE : NODE_HEIGHT,
    })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id)
    const isCondition = node.type === 'condition'
    const w = isCondition ? CONDITION_SIZE : NODE_WIDTH
    const h = isCondition ? CONDITION_SIZE : NODE_HEIGHT
    return {
      ...node,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}

export function useYamlToFlow(stepsJson: string | null | undefined): FlowResult {
  return useMemo(() => {
    const steps = parseStepsJson(stepsJson)
    if (steps.length === 0) return { nodes: [], edges: [] }

    const { nodes, edges } = buildFlowElements(steps)
    return applyDagreLayout(nodes, edges)
  }, [stepsJson])
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit 2>&1 | grep -c "error" || echo "0 errors"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline-flow/useYamlToFlow.ts
git commit -m "feat: add useYamlToFlow hook — converts steps_json to React Flow nodes/edges with Dagre layout"
```

---

### Task 7: useRunStatusOverlay Hook

**Files:**
- Create: `src/components/pipeline-flow/useRunStatusOverlay.ts`

- [ ] **Step 1: Create the run status overlay hook**

Create `src/components/pipeline-flow/useRunStatusOverlay.ts`:

```ts
import { useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'

interface SSEStepEvent {
  step_id: string
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  [key: string]: unknown
}

export function useRunStatusOverlay(
  nodes: Node[],
  edges: Edge[],
  stepEvents: Map<string, SSEStepEvent> | undefined,
): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    if (!stepEvents || stepEvents.size === 0) return { nodes, edges }

    const overlayedNodes = nodes.map((node) => {
      const event = stepEvents.get(node.id)
      if (!event?.status) return node
      return {
        ...node,
        data: {
          ...node.data,
          runStatus: event.status,
        },
      }
    })

    const overlayedEdges = edges.map((edge) => {
      const sourceEvent = stepEvents.get(edge.source)
      if (!sourceEvent?.status) return edge

      if (sourceEvent.status === 'completed') {
        return {
          ...edge,
          style: { ...edge.style, stroke: '#22c55e', strokeWidth: 2 },
          animated: false,
        }
      }
      if (sourceEvent.status === 'running') {
        return {
          ...edge,
          style: { ...edge.style, stroke: '#0071e3', strokeWidth: 2 },
          animated: true,
        }
      }
      if (sourceEvent.status === 'failed') {
        return {
          ...edge,
          style: { ...edge.style, stroke: '#ef4444', strokeWidth: 2 },
          animated: false,
        }
      }
      return edge
    })

    return { nodes: overlayedNodes, edges: overlayedEdges }
  }, [nodes, edges, stepEvents])
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pipeline-flow/useRunStatusOverlay.ts
git commit -m "feat: add useRunStatusOverlay hook — maps SSE events to node/edge visual states"
```

---

### Task 8: PipelineFlowView Main Component

**Files:**
- Create: `src/components/pipeline-flow/PipelineFlowView.tsx`

- [ ] **Step 1: Create the main flow view component**

Create `src/components/pipeline-flow/PipelineFlowView.tsx`:

```tsx
import { useCallback } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useThemeStore } from '@/stores/themeStore'
import type { Pipeline } from '@/api/pipelines'
import { nodeTypes, STEP_ACCENT } from './nodes'
import { useYamlToFlow } from './useYamlToFlow'
import { useRunStatusOverlay } from './useRunStatusOverlay'

interface SSEStepEvent {
  step_id: string
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  [key: string]: unknown
}

interface PipelineFlowViewProps {
  pipeline: Pipeline | null
  stepEvents?: Map<string, SSEStepEvent>
  className?: string
}

function FlowCanvas({ pipeline, stepEvents }: PipelineFlowViewProps) {
  const { theme } = useThemeStore()
  const isDark = theme === 'dark'
  const { fitView } = useReactFlow()

  const { nodes: rawNodes, edges: rawEdges } = useYamlToFlow(pipeline?.steps_json)
  const { nodes, edges } = useRunStatusOverlay(rawNodes, rawEdges, stepEvents)

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 })
  }, [fitView])

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

  if (nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-text3">
        <div className="text-center">
          <i className="ti ti-alert-circle mb-3 block text-4xl" />
          <p className="text-sm">无法解析步骤数据</p>
        </div>
      </div>
    )
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode={isDark ? 'dark' : 'light'}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
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
  )
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit 2>&1 | tail -5
```

Expected: No errors related to pipeline-flow components

- [ ] **Step 3: Commit**

```bash
git add src/components/pipeline-flow/PipelineFlowView.tsx
git commit -m "feat: add PipelineFlowView — main React Flow canvas with controls, minimap, and dark mode"
```

---

### Task 9: Integrate Visual Tab into PipelinesPage

**Files:**
- Modify: `src/pages/PipelinesPage.tsx:480,764-827`

- [ ] **Step 1: Add lazy import for PipelineFlowView**

At the top of `PipelinesPage.tsx` (after existing imports, around line 23), add:

```tsx
import { lazy, Suspense } from 'react'

const PipelineFlowView = lazy(() => import('@/components/pipeline-flow/PipelineFlowView'))
```

Note: `useState, useEffect, useRef, useMemo, useCallback` are already imported. Merge `lazy, Suspense` into the existing react import line.

- [ ] **Step 2: Update DetailTab type**

Change line 480 from:
```ts
type DetailTab = 'edit' | 'preview' | 'history'
```
to:
```ts
type DetailTab = 'edit' | 'preview' | 'visual' | 'history'
```

- [ ] **Step 3: Update tab bar rendering**

Change line 764 from:
```tsx
{(['edit', 'preview', 'history'] as const).map((t) => (
```
to:
```tsx
{(['edit', 'preview', 'visual', 'history'] as const).map((t) => (
```

- [ ] **Step 4: Update tab label mapping**

Change line 776 from:
```tsx
{t === 'edit' ? '编辑' : t === 'preview' ? '预览' : '历史'}
```
to:
```tsx
{t === 'edit' ? '编辑' : t === 'preview' ? '预览' : t === 'visual' ? '可视化' : '历史'}
```

- [ ] **Step 5: Add visual tab content panel**

After the `{detailTab === 'preview' && (...)}` block (after line 820), and before the `{detailTab === 'history' && (...)}` block (line 821), insert:

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

- [ ] **Step 6: Verify the build compiles**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/pages/PipelinesPage.tsx
git commit -m "feat: integrate visual tab into PipelinesPage with lazy-loaded PipelineFlowView"
```

---

### Task 10: Visual Verification

**Files:** None (manual testing)

- [ ] **Step 1: Start the frontend dev server**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npm run dev &
```

- [ ] **Step 2: Verify the build succeeds with no errors**

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui && npm run build 2>&1 | tail -10
```

Expected: Build succeeds, `dist/` directory created

- [ ] **Step 3: Commit build verification**

No commit needed — this is a verification step. If build fails, fix issues in the relevant task file and re-commit.

- [ ] **Step 4: Final commit with all files**

If any files were missed in previous commits:

```bash
cd /home/zhengxiaodong/exps/serverhub/serverhub-ui
git status
# If there are unstaged files in components/pipeline-flow/:
git add src/components/pipeline-flow/
git commit -m "chore: ensure all pipeline flow visualization files are tracked"
```
