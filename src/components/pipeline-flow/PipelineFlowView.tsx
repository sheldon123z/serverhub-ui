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
import { useYamlToFlow, parseStepsJson, buildFlowElements, applyDagreLayout } from './useYamlToFlow'
import { useRunStatusOverlay } from './useRunStatusOverlay'
import { useFlowEditor } from './useFlowEditor'
import { flowToYaml } from './useFlowToYaml'
import { StepPalette } from './StepPalette'
import { PropertyPanel } from './PropertyPanel'

interface PipelineFlowViewProps {
  pipeline: Pipeline | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stepEvents?: Map<string, any>
  className?: string
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

  // Load from steps_json when entering edit mode
  useEffect(() => {
    if (!editable || !pipeline?.steps_json) return
    if (pipeline.steps_json === loadedContentRef.current) return
    loadedContentRef.current = pipeline.steps_json

    const steps = parseStepsJson(pipeline.steps_json)
    if (steps.length === 0) return
    const { nodes, edges } = buildFlowElements(steps)
    const layouted = applyDagreLayout(nodes, edges)
    editor.loadFromSteps(layouted.nodes, layouted.edges)
  }, [editable, pipeline?.steps_json])

  // Sync visual changes → YAML (debounced 500ms)
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
      loadedContentRef.current = pipeline?.steps_json ?? ''
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
      {editable && <StepPalette />}

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

export default function PipelineFlowView(props: PipelineFlowViewProps) {
  return (
    <div className={`h-full w-full ${props.className ?? ''}`}>
      <ReactFlowProvider>
        <FlowCanvas {...props} />
      </ReactFlowProvider>
    </div>
  )
}
