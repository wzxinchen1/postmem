import type { ChatState } from './types'
import type { GraphDependencies } from './index'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { logger } from '@/src/lib/logger'
import { Errors } from '@/src/lib/errors'

export function createInitNode(deps: GraphDependencies) {
  return async function initNode(state: ChatState): Promise<Partial<ChatState>> {
    const model = await deps.modelService.get(state.modelId)
    if (!model) {
      throw Errors.internalError(`模型 ${state.modelId} 不存在`)
    }

    const hasVisionCapability = model.capabilities.includes('vision')
    logger.info('[ChatGraph] init 创建模型', {
      modelId: state.modelId,
      modelName: model.name,
      thinkingEffort: state.thinkingEffort,
      hasReasoning: state.thinkingEffort !== undefined && state.thinkingEffort !== 'none',
      hasVisionCapability,
    })

    const agent = await deps.agentService.getChatAgent(state.modelId, state.thinkingEffort)

    await deps.kbService.getKnowledgeBaseById(state.kbId)

    await deps.sseService.clearCancelled(state.conversationId)

    const chatMessages = await deps.conversationService.getMessages(state.conversationId)
    const langchainMessages: (HumanMessage | AIMessage)[] = []

    // 收集最近 10 条已记忆消息，保持原始顺序
    const memoriedMessages = chatMessages.filter(msg => msg.memoried)
    const recentMemoriedIds = new Set(
      memoriedMessages.slice(-10).map(msg => msg.id)
    )

    for (const msg of chatMessages) {
      if (!msg.memoried || recentMemoriedIds.has(msg.id)) {
        if (msg.role === 'user') {
          langchainMessages.push(new HumanMessage(msg.content))
        } else if (msg.role === 'assistant') {
          langchainMessages.push(new AIMessage(msg.content))
        }
      }
    }

    logger.info('[ChatGraph] init 完成', { conversationId: state.conversationId })

    return {
      agent,
      modelName: model.name,
      langchainMessages,
      hasVisionCapability,
    }
  }
}
