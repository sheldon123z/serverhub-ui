# Pipeline React Flow Visualization — Phase 1 Design Spec

> Date: 2026-04-09
> Status: Draft
> Scope: Phase 1 — Read-only visual rendering + runtime status overlay

## 1. Overview

Replace the static Mermaid preview with an interactive React Flow canvas that renders Pipeline steps as styled nodes connected by edges. During execution, nodes animate in real-time to reflect step status via the existing SSE mechanism.

**Goal**: Let non-technical users understand pipeline structure and execution progress at a glance — no YAML reading required.

**Approach**: New "Visual" tab alongside existing tabs (edit/preview/history). Zero backend changes.

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tab strategy | New "visual" tab alongside existing tabs | Low risk, preserves existing workflow |
| Runtime status | Included in Phase 1 | Most impactful visual feature for non-technical users |
| Condition node | Diamond shape + dual outputs | Classic flowchart convention, universally understood |
| Layout algorithm | Dagre (top-to-bottom) | Best fit for linear pipeline flows with branching |
| Backend changes | None | Pure frontend feature, consumes existing `steps_json` + SSE |
| Interaction mode | Read-only (no drag/edit) | Phase 2 scope |

## 3. Dependencies

### New npm packages

| Package | Version | Size (gzip) | Purpose |
|---------|---------|-------------|---------|
| `@xyflow/react` | ^12 | ~40KB | Core flow canvas, nodes, edges, controls |
| `@dagrejs/dagre` | ^1 | ~15KB | Automatic hierarchical layout algorithm |

### Existing dependencies (reused)

- `mermaid` — retained for existing preview tab
- `react-hot-toast` — status notifications
- `@tanstack/react-query` — data fetching (pipeline data)
- Tailwind CSS — styling
- Zustand (`themeStore`) — dark/light mode detection

## 4. File Structure

```
serverhub-ui/src/
├── components/pipeline-flow/
│   ├── PipelineFlowView.tsx        ← Main wrapper (Tab content)
│   ├── nodes/
│   │   ├── BaseStepNode.tsx        ← Shared node shell (icon, label, status badge)
│   │   ├── ConditionNode.tsx       ← Diamond shape, dual output handles
│   │   ├── ParallelNode.tsx        ← Double-border, multi output handles
│   │   └── index.ts               ← nodeTypes registry (exported as const)
│   ├── edges/
│   │   └── StatusEdge.tsx          ← Animated edge with status coloring
│   ├── useYamlToFlow.ts            ← steps_json → { nodes, edges } converter
│   └── useRunStatusOverlay.ts      ← SSE stepEvents → node/edge style mapper
├── pages/
│   └── PipelinesPage.tsx           ← Modified: add "visual" tab
```

### Design rationale: 3 node components, not 10

Most step types (shell, ssh, agent, http, notify, delay, playbook, approval) share the same rectangular shape — they only differ in icon, color accent, and label. `BaseStepNode` handles all of these via `data.type` prop. Only `ConditionNode` (diamond) and `ParallelNode` (multi-output) need custom geometry.

```ts
// index.ts — nodeTypes registry
export const nodeTypes = {
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
} as const
```

## 5. Visual Design — Apple Design System

Following `docs/DESIGN.md` (Apple-inspired design system). The flow canvas adopts the project's existing dark/light theming with Apple's principles of restraint.

### 5.1 Canvas

| Property | Light Mode | Dark Mode |
|----------|-----------|-----------|
| Background | `#f5f5f7` (Apple light gray) | `#1a1a2e` (existing dark) |
| Dot grid | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.06)` |
| Dot size | 1px, gap 20px | 1px, gap 20px |

### 5.2 Node Design

**Base rectangular node (8 types)**:

```
┌─────────────────────────────┐
│  [icon]  Step Name          │   ← 14px SF Pro Text, weight 600
│          step.type label    │   ← 11px SF Pro Text, weight 400, muted
└─────────────────────────────┘
```

| Property | Light Mode | Dark Mode |
|----------|-----------|-----------|
| Background | `#ffffff` | `#272729` (Apple dark surface) |
| Border | none (Apple: no borders on cards) | none |
| Shadow | `rgba(0,0,0,0.08) 0 2px 12px` | `rgba(0,0,0,0.3) 0 2px 12px` |
| Radius | 8px (Apple standard) | 8px |
| Padding | 10px 14px | 10px 14px |
| Width | 180px (fixed) | 180px |
| Font family | System (inherits SF Pro / Inter from project CSS) | Same |
| Name text | `#1d1d1f` | `#e2e8f0` |
| Type label | `rgba(0,0,0,0.48)` | `rgba(255,255,255,0.48)` |

**Icon accent strip**: A 3px left border in the step type's accent color. This is the ONLY color on the node in idle state, keeping the Apple "single accent" philosophy.

| Step Type | Accent Color | Icon (Tabler) | Type Label |
|-----------|-------------|---------------|------------|
| shell | `#374151` | ti-terminal-2 | Shell |
| ssh | `#06b6d4` | ti-network | SSH |
| agent | `#8b5cf6` | ti-robot | AI Agent |
| approval | `#f59e0b` | ti-user-check | Approval |
| condition | `#3b82f6` | ti-git-branch | Condition |
| parallel | `#10b981` | ti-arrows-split | Parallel |
| notify | `#eab308` | ti-bell | Notify |
| http | `#64748b` | ti-world | HTTP |
| delay | `#9ca3af` | ti-hourglass | Delay |
| playbook | `#6366f1` | ti-script | Playbook |

**Condition node (diamond)**:

```
        ◇ handle-in (top)
       ╱ ╲
      ╱   ╲
     ╱ [?] ╲        ← Diamond shape via CSS rotate(45deg)
     ╲     ╱         on inner container + counter-rotate text
      ╲   ╱
       ╲ ╱
   ◇        ◇
 handle-    handle-
 false      true
 (left)     (right)
```

- Diamond width/height: 100px (before rotation), node wrapper 142px to contain rotated shape
- Left output handle labeled `否` (red-tinted `#ef4444`), right labeled `是` (green-tinted `#22c55e`)
- Expression text shown as tooltip on hover

**Parallel node**:

- Same rectangular shape as BaseStepNode but with **double border** (2px inner, 2px outer with 2px gap, using box-shadow trick)
- Multiple output handles at bottom, one per branch, spaced evenly
- Branch labels shown as small tags beneath handles

### 5.3 Edge Design

| Property | Value |
|----------|-------|
| Type | `SmoothStep` (right-angle routing with rounded corners) |
| Stroke width | 1.5px |
| Color (idle) | `rgba(0,0,0,0.15)` light / `rgba(255,255,255,0.15)` dark |
| Arrow | `markerEnd` small arrowhead |
| Condition true edge | Green tint `#22c55e` + label "是" |
| Condition false edge | Red tint `#ef4444` + label "否" |
| Animated (running) | `animated: true` (built-in React Flow dashed animation) |

### 5.4 Handle (Connection Port) Design

| Property | Value |
|----------|-------|
| Size | 8px diameter |
| Background | `#d1d5db` light / `#4b5563` dark |
| Border | 2px solid white (creates inset ring effect) |
| Position | Top center (target), Bottom center (source) |
| Visibility | Always visible but subtle |

### 5.5 Controls & MiniMap

| Component | Placement | Style |
|-----------|-----------|-------|
| `<Controls />` | Bottom-left | Glass background `rgba(255,255,255,0.72)` / `rgba(0,0,0,0.72)` + `backdrop-filter: blur(12px)`, 8px radius |
| `<MiniMap />` | Bottom-right | Same glass style, 120x80px, node colors by type accent |
| `<Panel />` | Top-right | "Fit view" button, Apple-style pill |

## 6. Runtime Status Overlay

### 6.1 Status → Visual Mapping

When a pipeline run is active and the user is viewing the visual tab, the existing `usePipelineSSE` hook feeds step events into `useRunStatusOverlay`, which returns per-node style overrides.

| Step Status | Node Effect | Edge Effect |
|-------------|------------|-------------|
| `pending` | Opacity 0.5, no changes | Dashed stroke, opacity 0.3 |
| `running` | Apple Blue (`#0071e3`) glow shadow + pulse animation | `animated: true` + Apple Blue stroke |
| `completed` | Green (`#22c55e`) left-border accent + subtle checkmark badge (top-right) | Solid green stroke |
| `failed` | Red (`#ef4444`) left-border accent + X badge (top-right) + subtle red shadow | Solid red stroke |
| `skipped` | Opacity 0.35, grayscale filter | Dotted stroke, opacity 0.2 |

### 6.2 Status Badge

A small 16px circle badge in the top-right corner of the node:
- `completed`: green circle + white checkmark icon
- `failed`: red circle + white X icon
- `running`: Apple Blue circle + white spinning loader icon
- Other states: no badge

### 6.3 Pulse Animation (running state)

```css
@keyframes node-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 122, 227, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(0, 122, 227, 0); }
}
```

Uses Apple Blue (`#007ae3` / `#0071e3`) — the ONLY chromatic accent per Apple design rules. This ensures the running node stands out dramatically against the neutral canvas.

## 7. Data Flow

### 7.1 useYamlToFlow(stepsJson) → { nodes, edges }

**Input**: `steps_json` string from `Pipeline` object (already parsed by backend compiler).

**Algorithm**:

```
1. Parse steps_json → StepDefinition[]

2. For each step, create a Node:
   {
     id: step.id,
     type: step.type,            // maps to nodeTypes registry
     data: {
       name: step.name,
       type: step.type,
       icon: STEP_TYPE_ICON[step.type],
       accent: STEP_TYPE_ACCENT[step.type],
       // original step fields for tooltip
       command: step.command,
       prompt: step.prompt,
       expression: step.expression,
       ...
     },
     position: { x: 0, y: 0 },  // placeholder, Dagre fills this
   }

3. Derive edges from step sequence:
   a. Linear: steps[i] → steps[i+1] (for consecutive non-branching steps)
   b. Condition: step → on_true target (label "是", green)
                 step → on_false target (label "否", red)
   c. Parallel: step → each branch[0] (fan-out)
                each branch[last] → next step after parallel (fan-in)
   d. Parallel branches: internal linear edges within each branch

4. Apply Dagre layout:
   - rankdir: 'TB'
   - nodesep: 50
   - ranksep: 70
   - condition nodes: wider width (142px vs 180px)

5. Return { nodes: Node[], edges: Edge[] }
```

### 7.2 useRunStatusOverlay(stepEvents, nodes, edges)

**Input**: `Map<string, SSEStepEvent>` from existing `usePipelineSSE` hook.

**Output**: Modified `nodes[]` and `edges[]` with status-driven style overrides.

```
For each node:
  match = stepEvents.get(node.id)
  if match:
    node.data.runStatus = match.status
    node.className = status-based CSS class

For each edge:
  sourceStatus = stepEvents.get(edge.source)?.status
  if sourceStatus === 'completed':
    edge.style = { stroke: '#22c55e' }
    edge.animated = false
  if sourceStatus === 'running':
    edge.style = { stroke: '#0071e3' }
    edge.animated = true
```

## 8. Component API

### PipelineFlowView

```tsx
interface PipelineFlowViewProps {
  pipeline: Pipeline | null         // Current selected pipeline
  stepEvents?: Map<string, SSEStepEvent>  // Live SSE events (optional)
  className?: string
}
```

- If `pipeline` is null → show empty state message
- If `pipeline.steps_json` is empty/invalid → show error state
- If `stepEvents` provided and non-empty → overlay run status on nodes/edges
- Controls: fit-view button, zoom in/out, minimap

### BaseStepNode

```tsx
interface BaseStepNodeData {
  name: string
  type: string
  icon: string
  accent: string
  runStatus?: StepStatus     // injected by useRunStatusOverlay
  command?: string           // for tooltip
  prompt?: string            // for tooltip
  [key: string]: unknown
}
```

### ConditionNode

```tsx
interface ConditionNodeData extends BaseStepNodeData {
  expression?: string
  on_true?: string
  on_false?: string
}
```

Renders diamond shape. Two source handles: `handle-true` (right, green label) and `handle-false` (left, red label).

### ParallelNode

```tsx
interface ParallelNodeData extends BaseStepNodeData {
  branches?: StepDefinition[][]
}
```

Renders double-border rectangle. N source handles at bottom, one per branch.

## 9. PipelinesPage.tsx Modifications

Minimal changes to existing page:

1. Add `'visual'` to `DetailTab` type: `type DetailTab = 'edit' | 'preview' | 'visual' | 'history'`

2. Add tab button in the tab bar:
```tsx
{ id: 'visual', label: 'Visual', icon: 'ti-topology-star-3' }
```

3. Add tab content panel:
```tsx
{detailTab === 'visual' && selectedPipeline && (
  <PipelineFlowView
    pipeline={selectedPipeline}
    stepEvents={activeRunId ? stepEvents : undefined}
  />
)}
```

4. Trigger `steps_json` query when visual tab is active (reuse existing pipeline data, no new API call needed).

## 10. Dark/Light Theme Integration

Read theme from existing `useThemeStore()`. Pass to React Flow:

```tsx
const { theme } = useThemeStore()
const isDark = theme === 'dark'

<ReactFlow
  colorMode={isDark ? 'dark' : 'light'}
  ...
/>
```

Node components read `isDark` to switch between light/dark surface colors, text colors, and shadow intensities.

## 11. Edge Cases

| Case | Handling |
|------|---------|
| Empty pipeline (no steps) | Show centered empty state: "No steps defined" |
| Invalid steps_json | Show error message in flow area |
| Very large pipeline (50+ steps) | Dagre handles layout; MiniMap for navigation; fitView on load |
| Parallel with 5+ branches | Horizontal fan-out, Dagre nodesep handles spacing |
| Condition with missing target | Dangling edge with dashed red styling |
| SSE disconnects mid-run | Last known status preserved; reconnect on tab re-focus |
| Theme switch while viewing | `colorMode` prop triggers React Flow re-render |
| steps_json has only string models | Fallback: parse as `[{id: s, name: s, type: 'shell'}]` |

## 12. Performance

- `nodeTypes` defined as module-level const (not inside component) to prevent React Flow re-registration
- Dagre layout computed in `useMemo` keyed on `steps_json` string
- SSE overlay applied via shallow merge, not full node replacement
- React Flow `proOptions={{ hideAttribution: false }}` — keep attribution (free tier)
- Lazy-load `@xyflow/react` CSS only when visual tab is first opened

## 13. Not In Scope (Phase 2+)

- Drag-and-drop step creation from palette
- Right-panel property editing form
- Visual → YAML reverse serialization
- Undo/redo
- Copy/paste nodes
- Template variable autocomplete `{{steps.xxx.output}}`
- Custom edge routing algorithms
- Node grouping/collapsing

## 14. Success Criteria

1. User can view any existing pipeline as a visual flowchart by clicking the "Visual" tab
2. Condition nodes render as diamonds with clearly labeled true/false branches
3. Parallel nodes show fan-out/fan-in visually
4. During pipeline execution, nodes animate through pending → running → completed/failed states
5. Running node has a distinctive Apple Blue pulse that is visible at a glance
6. Dark and light themes both render correctly
7. No regressions to existing edit/preview/history tabs
