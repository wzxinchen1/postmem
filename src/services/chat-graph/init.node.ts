import type { ChatState, GraphDependencies } from './types'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { logger } from '@/src/lib/logger'

export function createInitNode(deps: GraphDependencies) {
  return async function initNode(state: ChatState): Promise<Partial<ChatState>> {
    const model = await deps.modelService.get(state.modelId)
    if (!model) {
      throw new Error(`模型 ${state.modelId} 不存在`)
    }

    const provider = await deps.providerService.get(model.providerId)
    if (!provider) {
      throw new Error('模型对应的提供商不存在')
    }
    if (!provider.vendor) {
      throw new Error(`提供商 ${provider.id} 未关联厂商`)
    }

    const chatSetting = await deps.chatSettingService.get()
    const hasReasoning = state.thinkingEffort !== undefined && state.thinkingEffort !== 'none'
    const hasVisionCapability = model.capabilities.includes('vision')
    logger.info('[ChatGraph] init 创建模型', {
      modelId: state.modelId,
      modelName: model.name,
      thinkingEffort: state.thinkingEffort,
      hasReasoning,
      hasVisionCapability,
    })
    const agent = deps.chatModelFactory.createAgent(provider.vendor, {
      model: model.name,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      maxTokens: chatSetting.maxOutputTokens,
      reasoning: !!hasReasoning,
      reasoningEffort: hasReasoning ? state.thinkingEffort : undefined,
      config: { capabilities: model.capabilities },
    })

    await deps.kbService.getKnowledgeBaseById(state.kbId)

    await deps.sseService.clearCancelled(state.conversationId)

    const chatMessages = await deps.conversationService.getMessages(state.conversationId)
    const langchainMessages: (HumanMessage | AIMessage)[] = []
    for (const msg of chatMessages) {
      if (!msg.memoried) {
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
