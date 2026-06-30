import type { ChatState } from './types'
import type { GraphDependencies } from './index'
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
    logger.info('[ChatGraph] memoryThreshold', { memoryThreshold })

    // 只收集未记忆的消息，已记忆消息不参与阈值计算
    const unmemoriedMessages = chatMessages.filter(msg => !msg.memoried)

    if (unmemoriedMessages.length === 0) {
      return {}
    }

    // 计算未记忆消息的 token 总量
    let unmemoriedTokens = 0
    for (const msg of unmemoriedMessages) {
      unmemoriedTokens += msg.tokens
    }

    if (unmemoriedTokens < memoryThreshold) {
      return {}
    }

    // 触发记忆后，全部未记忆消息都参与记忆
    const totalContentLength = unmemoriedMessages.reduce((sum, m) => sum + m.content.length, 0)
    logger.info('[ChatGraph] saveMemory 触发入库', { unmemoriedCount: unmemoriedMessages.length, unmemoriedTokens, totalContentLength, threshold: memoryThreshold })
    const memorizedMessageIds = await deps.chatMemoryService.createMemory(
      unmemoriedMessages,
      state.conversationId,
      state.kbId,
      state.agent as any
    )

    for (const msgId of memorizedMessageIds) {
      await deps.conversationService.markMessageMemoried(msgId)
    }

    logger.info('[ChatGraph] saveMemory 完成', { memorizedCount: memorizedMessageIds.length })

    return {}
  }
}
