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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface PipelineFlowViewProps {
  pipeline: Pipeline | null
  stepEvents?: Map<string, any>
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
