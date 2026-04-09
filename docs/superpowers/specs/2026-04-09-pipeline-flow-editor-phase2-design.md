# Pipeline React Flow Visual Editor — Phase 2 Design Spec

> Date: 2026-04-09
> Status: Draft
> Scope: Phase 2 — Interactive visual editing with YAML bidirectional sync

## 1. Overview

Upgrade the Phase 1 read-only flow canvas into a full visual editor. Users can drag step types from a sidebar, connect them on the canvas, edit properties in a right panel, and have changes automatically synced to YAML (and vice versa). Non-technical users never need to touch YAML; advanced users can freely switch between modes.

**Goal**: Complete visual pipeline authoring — create, edit, and connect steps without writing YAML.

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Edit mode | Dual-mode with real-time bidirectional sync (Visual ↔ YAML) | Maximum flexibility for all user levels |
| Property panel | Right-side drawer (~300px), slides out on node click | Ample space for complex forms, Figma-like UX |
| Step palette | Left-side vertical toolbar (48px), icon-only with tooltip | Compact, doesn't steal canvas space |
| Node interaction | Draggable + connectable (upgrade from Phase 1 read-only) | Core editing requirement |
| Serialization | Visual → YAML on every change (debounced 500ms) | Keeps YAML tab always up-to-date |
| Deserialization | YAML → Visual on YAML save/change | Reuses Phase 1 `useYamlToFlow` |

## 3. Architecture Changes from Phase 1

### What changes

| Component | Phase 1 | Phase 2 |
|-----------|---------|---------|
| `PipelineFlowView.tsx` | Read-only wrapper | Edit-mode wrapper with state management |
| Node props | `nodesDraggable={false}` | `nodesDraggable={true}` |
| Node connection | `nodesConnectable={false}` | `nodesConnectable={true}` with validation |
| `PipelinesPage.tsx` | "visual" tab = read-only preview | "visual" tab = full editor (shared state with "edit" tab) |

### What's new

| Component | Purpose |
|-----------|---------|
| `StepPalette.tsx` | Left sidebar with draggable step type icons |
| `PropertyPanel.tsx` | Right drawer with dynamic form per step type |
| `useFlowToYaml.ts` | React Flow nodes/edges → YAML serialization (reverse of `useYamlToFlow`) |
| `useFlowEditor.ts` | Central state hook: manages nodes/edges, handles add/delete/connect/update |
| `PropertyForms/*.tsx` | Per-step-type form components (ShellForm, AgentForm, ConditionForm, etc.) |

## 4. File Structure

```
serverhub-ui/src/components/pipeline-flow/
├── PipelineFlowView.tsx          ← Modified: add edit mode, integrate palette + panel
├── StepPalette.tsx               ← NEW: left sidebar, draggable step icons
├── PropertyPanel.tsx             ← NEW: right drawer, renders step-specific form
├── useFlowEditor.ts              ← NEW: central state (nodes/edges/selected/dirty)
├── useFlowToYaml.ts              ← NEW: nodes/edges → YAML string serialization
├── useYamlToFlow.ts              ← Existing (Phase 1, unchanged)
├── useRunStatusOverlay.ts        ← Existing (Phase 1, unchanged)
├── property-forms/               ← NEW: per-step-type form components
│   ├── ShellForm.tsx             ← command, timeout, on_failure
│   ├── SshForm.tsx               ← host, command, timeout
│   ├── AgentForm.tsx             ← prompt, model, output_format
│   ├── ApprovalForm.tsx          ← assignee, timeout
│   ├── ConditionForm.tsx         ← expression, on_true, on_false selectors
│   ├── ParallelForm.tsx          ← branch management (add/remove/reorder)
│   ├── NotifyForm.tsx            ← channel, message template
│   ├── HttpForm.tsx              ← url, method, headers, body
│   ├── DelayForm.tsx             ← seconds
│   ├── PlaybookForm.tsx          ← playbook_id selector
│   ├── CommonFields.tsx          ← shared fields: name, id, timeout, on_failure, retry
│   └── index.ts                  ← registry mapping step type → form component
├── nodes/                        ← Existing (Phase 1)
│   ├── index.ts
│   ├── BaseStepNode.tsx          ← Modified: add selected state highlight
│   ├── ConditionNode.tsx         ← Modified: add selected state highlight
│   └── ParallelNode.tsx          ← Modified: add selected state highlight
└── edges/
    └── (empty, use default smoothstep)
```

## 5. Component Details

### 5.1 StepPalette (Left Sidebar)

A fixed 48px wide vertical bar on the left edge of the visual tab canvas.

```
┌──────┐
│ [≡]  │  ← Collapse toggle (optional Phase 3)
├──────┤
│  >_  │  ← Shell (drag me)
│  ⌂   │  ← SSH
│  🤖  │  ← Agent
│  ✓   │  ← Approval
│  ◇   │  ← Condition
│  ⫘   │  ← Parallel
│  🔔  │  ← Notify
│  🌐  │  ← HTTP
│  ⏳  │  ← Delay
│  📜  │  ← Playbook
└──────┘
```

**Behavior:**
- Each item shows the step type icon in its accent color (from `STEP_ACCENT`)
- Hover: tooltip with step type name + brief description
- Drag: sets `dataTransfer` with step type, triggers `onDrop` on canvas
- The palette uses existing Tabler Icons (`ti-` classes) already in the project
- Glass background: `bg-white/70 dark:bg-black/50 backdrop-blur-sm`

**Drag-and-drop mechanism (HTML5 DnD):**
```
Palette item: onDragStart → dataTransfer.setData('application/pipeline-step', stepType)
Canvas: onDragOver → preventDefault()
Canvas: onDrop → screenToFlowPosition() → create new node with defaults
```

### 5.2 PropertyPanel (Right Drawer)

A 320px wide panel that slides in from the right when a node is selected. Slides out when clicking empty canvas or pressing Escape.

```
┌──────────────────────────┐
│ ✕  Shell Step            │  ← Header: type icon + name + close button
├──────────────────────────┤
│ ID:    [auto-generated]  │  ← CommonFields
│ Name:  [步骤名称      ]  │
│ ───────────────────────  │
│ Command:                 │  ← Type-specific fields
│ ┌──────────────────────┐ │
│ │ uptime && df -h      │ │  ← Monospace textarea
│ └──────────────────────┘ │
│ Timeout: [30    ] sec    │
│ On Failure: [abort ▾]    │  ← Select: abort|skip|retry|notify_continue
│ Retry Count: [0   ]     │
│ Retry Delay: [5   ] sec │
│ ───────────────────────  │
│ [删除此步骤]              │  ← Danger button at bottom
└──────────────────────────┘
```

**Behavior:**
- Opens when `onNodeClick` fires (set selected node ID)
- Closes on: close button click, Escape key, click on empty canvas (`onPaneClick`)
- Form changes immediately update node data via `useFlowEditor.updateNodeData()`
- Changes are debounced (500ms) before triggering YAML re-serialization
- `CommonFields` appears at the top of every step type's form
- Type-specific form renders below CommonFields based on `node.type`
- "删除此步骤" button removes the node and all connected edges
- Scroll if content exceeds panel height
- Transition: `transform: translateX(100%)` → `translateX(0)` with 200ms ease

**Apple Design styling:**
- Glass background matching project's existing panel styles
- No visible border (Apple: no borders on cards)
- Subtle shadow: `0 -2px 20px rgba(0,0,0,0.1)`
- Form inputs: minimal styling, bottom-border only (Apple form aesthetic)
- Section dividers: thin `border-border` lines

### 5.3 useFlowEditor Hook

Central state management for the visual editor. Wraps React Flow's `useNodesState` and `useEdgesState` with additional business logic.

```ts
interface FlowEditorState {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  dirty: boolean  // has unsaved changes
}

interface FlowEditorActions {
  // Node operations
  addNode(type: string, position: { x: number; y: number }): string  // returns new node ID
  removeNode(id: string): void
  updateNodeData(id: string, data: Partial<Record<string, unknown>>): void
  selectNode(id: string | null): void

  // Edge operations
  onConnect(connection: Connection): void  // validates + creates edge
  removeEdge(id: string): void

  // React Flow callbacks (pass directly to <ReactFlow>)
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange

  // Sync
  loadFromYaml(stepsJson: string): void   // YAML → visual (reuses useYamlToFlow)
  toYaml(): string                         // visual → YAML (uses useFlowToYaml)
  markClean(): void                        // after save
}
```

**Connection validation rules:**
- Cannot connect a node to itself
- Cannot create duplicate edges (same source → same target)
- Cannot create cycles (basic check: target cannot be an ancestor of source)
- Condition nodes: source handle must be `handle-true` or `handle-false`

**Node ID generation:**
- Format: `step-{type}-{nanoid(6)}` e.g. `step-shell-a3bk2f`
- Ensures unique IDs that are also valid YAML identifiers

### 5.4 useFlowToYaml Hook

Reverse of `useYamlToFlow`: converts React Flow nodes and edges back into a YAML string.

```ts
function useFlowToYaml(nodes: Node[], edges: Edge[]): string
```

**Algorithm:**
```
1. Topological sort nodes based on edges (respect execution order)
2. For each node, extract step definition from node.data:
   - id, type, name from node data
   - Type-specific fields (command, prompt, expression, etc.)
   - on_failure, timeout, retry from CommonFields

3. Handle special cases:
   - Condition nodes: derive on_true/on_false from outgoing edges with handle IDs
   - Parallel nodes: group branch sub-nodes by tracing fan-out edges,
     reconstruct branches array

4. Serialize step array to YAML string using simple template
   (not using a YAML library — just string concatenation for predictable output)

5. Wrap in full pipeline YAML:
   name, display_name, description, version, trigger, params, steps
```

**Why not use a YAML library?**
- js-yaml would add ~30KB
- Our YAML output is simple and predictable (flat steps array)
- String template gives full control over formatting (indentation, comments)
- The backend compiler handles the real parsing; we just need valid YAML

### 5.5 Property Forms

Each step type has a dedicated form component. All share `CommonFields` at the top.

**CommonFields** (shared by all 10 types):
| Field | Type | Required | Default |
|-------|------|----------|---------|
| `id` | text (readonly after creation) | yes | auto-generated |
| `name` | text | yes | "新建 {type} 步骤" |
| `timeout` | number (seconds) | no | 30 |
| `on_failure` | select: abort/skip/retry/notify_continue | no | "abort" |
| `retry_count` | number | no | 0 |
| `retry_delay` | number (seconds) | no | 5 |

**Type-specific fields:**

| Type | Fields | Input Types |
|------|--------|-------------|
| shell | `command` | textarea (monospace) |
| ssh | `host`, `command` | text, textarea |
| agent | `prompt`, `model`, `output_format` | textarea, select, select |
| approval | `assignee`, `timeout` | text, number |
| condition | `expression`, `on_true`, `on_false` | text, select (populated from existing node IDs), select |
| parallel | `branches` | branch list manager (add/remove) |
| notify | `channel`, `message` | select (telegram/email/webhook), textarea with template vars |
| http | `url`, `method`, `headers`, `body` | text, select (GET/POST/PUT/DELETE), key-value editor, textarea |
| delay | `seconds` | number |
| playbook | `playbook_id` | select (fetched from existing playbooks) |

**Template variable autocomplete:**
In textarea fields (command, prompt, message), typing `{{` triggers a dropdown showing:
- `{{params.xxx}}` — pipeline parameters
- `{{steps.{step_id}.output}}` — outputs from previous steps (derived from graph topology)
- `{{run.id}}` — current run ID

This is Phase 3 scope but the textarea component should be designed to accept an optional `suggestions` prop for future integration.

### 5.6 Node Selection Highlight

Upgrade Phase 1 node components to show selection state:

**When selected (clicked):**
- Apple Blue ring: `shadow-[0_0_0_2px_#0071e3]`
- Slight scale: `scale-[1.02]`
- This replaces any status ring while selected (status ring returns when deselected)

**Implementation:** Add `selected` prop handling in BaseStepNode, ConditionNode, ParallelNode. React Flow passes `selected` boolean automatically when `elementsSelectable={true}`.

## 6. Bidirectional Sync Flow

```
┌─────────────┐     useFlowToYaml      ┌──────────────┐
│ Visual Tab  │ ──────(500ms)────────→ │ YAML string  │
│ (React Flow)│                        │ (shared state)│
│             │ ←─── useYamlToFlow ──  │              │
└─────────────┘     (on YAML edit)     └──────────────┘
                                            │
                                            ↓
                                    ┌──────────────┐
                                    │  Edit Tab    │
                                    │  (textarea)  │
                                    └──────────────┘
```

**Sync rules:**
1. **Visual → YAML**: Every visual change (add/move/connect/edit node) triggers debounced `useFlowToYaml`. Result updates the shared `editorContent` state (same state the YAML edit tab reads/writes).
2. **YAML → Visual**: When user switches from "编辑" tab to "可视化" tab, if `editorContent` has changed, re-run `useYamlToFlow` to refresh the canvas.
3. **Conflict prevention**: Only one mode is active at a time (tabs are exclusive). No simultaneous editing.
4. **Dirty tracking**: Both modes set `editorDirty = true` on changes. Save button remains in PipelinesPage (not inside flow view).

## 7. PipelinesPage Integration

### Modified layout for Visual tab:

```
┌────────┬──────────────────────────────────────┬──────────┐
│        │  ┌──┬──────────────────────┬───────┐ │          │
│ Left   │  │P │                      │       │ │  Right   │
│ Panel  │  │a │   React Flow Canvas  │ Prop  │ │  Panel   │
│ (list) │  │l │                      │ Panel │ │  (runs)  │
│        │  │e │   [nodes + edges]    │ 320px │ │          │
│        │  │t │                      │       │ │          │
│        │  │t │                      │       │ │          │
│        │  │e │                      │       │ │          │
│        │  │48│                      │       │ │          │
│        │  └──┴──────────────────────┴───────┘ │          │
├────────┴─────────────────────────────────────┴──────────┤
│  Tab bar: [编辑] [预览] [可视化*] [历史]    [运行] [删除] │
└─────────────────────────────────────────────────────────┘
```

The visual tab replaces the center content area with: `StepPalette (48px) + Canvas (flex-1) + PropertyPanel (320px, conditional)`.

### State sharing between tabs:

```ts
// PipelinesPage already has:
const [editorContent, setEditorContent] = useState('')  // YAML string
const [editorDirty, setEditorDirty] = useState(false)

// Visual tab reads/writes the same editorContent
// When visual tab makes changes → useFlowToYaml → setEditorContent
// When switching to visual tab → useYamlToFlow(editorContent) → initialize canvas
```

The save button (already in PipelinesPage) calls `updateMutation.mutate({ id, yaml: editorContent })` regardless of which tab made the changes.

## 8. Backend Changes

**None.** The backend already:
- Accepts YAML via `PUT /api/pipelines/{id}` (the editor just sends YAML)
- Returns `steps_json` via `GET /api/pipelines/{id}` (used by visual tab to render)
- Validates YAML via `POST /api/pipelines/validate` (reused for visual tab validation)

## 9. Edge Cases

| Case | Handling |
|------|---------|
| Orphan nodes (not connected to any edge) | Allowed — rendered with dashed border warning |
| Delete node with connected edges | Remove node + all connected edges |
| Condition node missing on_true/on_false edge | Warning icon on node, YAML outputs empty string for missing target |
| Parallel with 0 branches | Warning state, serializes as empty branches array |
| Cyclic connection attempt | Blocked by `onConnect` validator, toast error "不能创建循环连接" |
| YAML parse error when switching to visual | Show error overlay on canvas with "YAML 解析失败" message |
| Very large pipeline (50+ nodes) | Dagre handles layout; MiniMap for navigation |
| Undo after delete | Not in Phase 2 scope (Phase 3: Ctrl+Z) |

## 10. Not In Scope (Phase 3)

- Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
- Copy/paste nodes
- Template variable autocomplete `{{steps.xxx.output}}`
- Keyboard shortcuts (Delete key to remove selected node)
- Multi-select and bulk operations
- Node grouping/collapsing
- Custom edge routing
- Pipeline parameter editor (params section of YAML)
- Trigger configuration editor (trigger section of YAML)

## 11. Success Criteria

1. User can drag any of 10 step types from palette onto canvas to create a node
2. User can connect nodes by dragging from source handle to target handle
3. Clicking a node opens the property panel with the correct form for that step type
4. Editing any field in the property panel updates the node data and syncs to YAML
5. Editing YAML in the "编辑" tab and switching to "可视化" refreshes the canvas
6. The save button works from both tabs (saves the same YAML)
7. Condition nodes correctly derive on_true/on_false from connected edges
8. Cyclic connections are rejected with user-friendly error
9. No regressions to Phase 1 (runtime status overlay still works)
10. Dark and light themes both render correctly
