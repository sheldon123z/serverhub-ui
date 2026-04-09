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
  const parallelBranches = new Map<string, string[][]>()

  for (const step of steps) {
    const isParallel = step.type === 'parallel'

    nodes.push({
      id: step.id,
      type: step.type,
      position: { x: 0, y: 0 },
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

    if (isParallel) {
      const branches = (step as Record<string, unknown>).branches as StepDefinition[][] | StepDefinition[] | undefined
      if (Array.isArray(branches) && branches.length > 0) {
        const branchIds: string[][] = []

        for (const branch of branches) {
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

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const nextStep = i + 1 < steps.length ? steps[i + 1] : null

    if (step.type === 'condition') {
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
      const branchIds = parallelBranches.get(step.id) ?? []
      for (const branch of branchIds) {
        if (branch.length > 0) {
          edges.push({
            id: `e-${step.id}-fork-${branch[0]}`,
            source: step.id,
            target: branch[0],
            type: 'smoothstep',
          })
        }
      }
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
