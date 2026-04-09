import { useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'

export function useRunStatusOverlay(
  nodes: Node[],
  edges: Edge[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stepEvents: Map<string, any> | undefined,
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
