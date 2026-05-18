import type { ChatState, GraphDependencies } from './types'
import type { ChatMessage } from '@/src/types'
import { logger } from '@/src/lib/logger'

export function createSaveMemoryNode(deps: GraphDependencies) {
  return async function saveMemoryNode(state: ChatState): Promise<Partial<ChatState>> {
    if (await deps.sseService.isCancelled(state.conversationId)) {
      return { cancelled: true }
    }

    const chatMessages = await deps.conversationService.getMessages(state.conversationId)
    if (chatMessages.length === 0) {
      return {}
    }

    const chatSetting = await deps.chatSettingService.get()
    const memoryThreshold = chatSetting.memoryContextThreshold * 1000

    const KEEP_RECENT_COUNT = 3
    const maxMemoryIndex = chatMessages.length - KEEP_RECENT_COUNT

    let firstUnmemoriedIndex = -1
    for (let i = 0; i < maxMemoryIndex; i++) {
      if (!chatMessages[i].memoried) {
        firstUnmemoriedIndex = i
        break
      }
    }

    if (firstUnmemoriedIndex === -1) {
      return {}
    }

    const unmemoriedMessages: ChatMessage[] = []
    for (let i = firstUnmemoriedIndex; i < maxMemoryIndex; i++) {
      unmemoriedMessages.push(chatMessages[i])
    }

    let currentTokens = 0
    for (const msg of unmemoriedMessages) {
      currentTokens += msg.tokens
      if (currentTokens >= memoryThreshold) {
        break
      }
    }

    if (currentTokens < memoryThreshold) {
      return {}
    }

    const memorizedMessageIds = await deps.chatMemoryService.createMemory(
      unmemoriedMessages,
      state.conversationId,
      state.kbId,
      state.agent
    )

    for (const msgId of memorizedMessageIds) {
      await deps.conversationService.markMessageMemoried(msgId)
    }

    logger.info('[ChatGraph] saveMemory 完成', { memorizedCount: memorizedMessageIds.length })

    return {}
  }
}
