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
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
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
    if (source === target) return

    setEdges((eds) => {
      const exists = eds.some(
        (e) =>
          e.source === source &&
          e.target === target &&
          e.sourceHandle === (connection.sourceHandle ?? null) &&
          e.targetHandle === (connection.targetHandle ?? null),
      )
      if (exists) return eds
      if (hasPath(eds, target, source)) return eds

      setDirty(true)
      return addEdge({ ...connection, type: 'smoothstep' }, eds)
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
