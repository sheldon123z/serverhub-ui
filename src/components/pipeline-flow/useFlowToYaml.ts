import { useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'

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
      const trueEdge = edges.find((e) => e.source === node.id && e.sourceHandle === 'handle-true')
      const falseEdge = edges.find((e) => e.source === node.id && e.sourceHandle === 'handle-false')
      if (trueEdge) lines.push(`  on_true: ${escapeYaml(trueEdge.target)}`)
      if (falseEdge) lines.push(`  on_false: ${escapeYaml(falseEdge.target)}`)
      break
    }
    case 'parallel': {
      const forkEdges = edges.filter((e) => e.source === node.id)
      if (forkEdges.length > 0) {
        lines.push(`  branches:`)
        for (const fe of forkEdges) {
          let current = fe.target
          const visited = new Set<string>()
          while (current && !visited.has(current)) {
            visited.add(current)
            const bn = allNodes.find((n) => n.id === current)
            if (!bn) break
            const bd = bn.data as StepData
            lines.push(`      - id: ${escapeYaml(bn.id)}`)
            lines.push(`        type: ${bd.type}`)
            if (bd.name) lines.push(`        name: ${escapeYaml(bd.name)}`)
            if (bd.command) lines.push(`        command: ${escapeYaml(bd.command)}`)
            const nextEdge = edges.find((e) => e.source === current && !e.id.includes('-join-'))
            current = nextEdge?.target ?? ''
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

  const parallelIds = new Set(nodes.filter((n) => n.type === 'parallel').map((n) => n.id))
  const branchNodeIds = new Set<string>()
  for (const e of edges) {
    if (parallelIds.has(e.source) && !e.id.includes('-join-')) {
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
