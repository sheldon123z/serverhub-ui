/**
 * processMessages — pure function that groups tool calls under assistant messages.
 *
 * Extracted from hooks/useProcessedMessages.ts for reuse in Pipeline chat.
 */

import type { ChatMessage, ProcessedMessage, ToolCallItem, SubAgentItem } from '@/types/agent'

export function processMessages(messages: ChatMessage[]): ProcessedMessage[] {
  const result: ProcessedMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'tool_call') {
      let last = result.length > 0 ? result[result.length - 1] : null
      if (!last || last.message.role !== 'assistant') {
        const syntheticAssistant: ProcessedMessage = {
          message: { _id: `synth-${msg._id}`, role: 'assistant', content: '' },
          toolCalls: [],
          subAgents: [],
        }
        result.push(syntheticAssistant)
        last = syntheticAssistant
      }
      if (last) {
        if (msg.args?.subagent_type) {
          const sa: SubAgentItem = {
            id: msg._id,
            name: (msg.args.subagent_name as string) ?? msg.tool ?? 'subagent',
            subAgentName: (msg.args.subagent_name as string) ?? msg.tool ?? 'SubAgent',
            input: (msg.args as Record<string, unknown>) ?? {},
            output: undefined,
            status: msg.content ? 'completed' : 'pending',
          }
          last.subAgents.push(sa)
        } else {
          const tc: ToolCallItem = {
            id: msg._id,
            name: msg.tool ?? 'unknown',
            args: msg.args ?? {},
            result: msg.content || undefined,
            status: msg.content ? 'completed' : 'pending',
          }
          last.toolCalls.push(tc)
        }
      }
      continue
    }

    if (msg.role === 'tool_result') {
      const last = result.length > 0 ? result[result.length - 1] : null
      if (last && last.message.role === 'assistant') {
        const tc = last.toolCalls.find(
          (t) => t.name === msg.tool && t.status === 'pending',
        )
        if (tc) {
          tc.result = msg.content
          tc.status = msg.content?.startsWith('Error') ? 'error' : 'completed'
        }
        const sa = last.subAgents.find(
          (s) => s.name === msg.tool && s.status === 'pending',
        )
        if (sa) {
          try {
            sa.output = JSON.parse(msg.content) as Record<string, unknown>
          } catch {
            sa.output = { result: msg.content }
          }
          sa.status = msg.content?.startsWith('Error') ? 'error' : 'completed'
        }
      }
      continue
    }

    result.push({
      message: msg,
      toolCalls: [],
      subAgents: [],
    })
  }

  return result
}
