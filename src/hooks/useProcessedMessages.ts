/**
 * useProcessedMessages — hook wrapper around processMessages pure function.
 *
 * Core logic extracted to lib/processMessages.ts for reuse.
 */

import { useMemo } from 'react'
import { useChatStore } from '@/stores/chatStore'
import type { ProcessedMessage } from '@/types/agent'
import { processMessages } from '@/lib/processMessages'

export function useProcessedMessages(): ProcessedMessage[] {
  const messages = useChatStore((s) => s.messages)
  return useMemo(() => processMessages(messages), [messages])
}
