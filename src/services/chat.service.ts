import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { ConversationService } from '@/src/services/conversation.service'
import { SearchService } from '@/src/services/chat-search.service'
import { ChatMemoryService } from '@/src/services/chat-memory.service'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { ChatModelFactory } from '@/src/services/chat-model-factory.service'
import { SSEService } from '@/src/services/sse.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { KBService } from '@/src/services/kb.service'
import { createChatGraph } from '@/src/services/chat-graph'
import { logger } from '@/src/lib/logger'
import { createId } from '@paralleldrive/cuid2'
import type { ChatCompletionRequest } from '@/src/types'

export interface ChatResult {
  conversationId: string
}

interface Dependencies {
  prisma: PrismaClient
  conversationService: ConversationService
  searchService: SearchService
  chatMemoryService: ChatMemoryService
  chatSettingService: ChatSettingService
  chatModelFactory: ChatModelFactory
  sseService: SSEService
  providerService: ProviderService
  modelService: ModelService
  kbService: KBService
}

export class ChatService {
  private prisma: PrismaClient
  private conversationService: ConversationService
  private searchService: SearchService
  private chatMemoryService: ChatMemoryService
  private chatSettingService: ChatSettingService
  private chatModelFactory: ChatModelFactory
  private sseService: SSEService
  private providerService: ProviderService
  private modelService: ModelService
  private kbService: KBService

  constructor({
    prisma,
    conversationService,
    searchService,
    chatMemoryService,
    chatSettingService,
    chatModelFactory,
    sseService,
    providerService,
    modelService,
    kbService,
  }: Dependencies) {
    this.prisma = prisma
    this.conversationService = conversationService
    this.searchService = searchService
    this.chatMemoryService = chatMemoryService
    this.chatSettingService = chatSettingService
    this.chatModelFactory = chatModelFactory
    this.sseService = sseService
    this.providerService = providerService
    this.modelService = modelService
    this.kbService = kbService
  }

  async chat(params: ChatCompletionRequest): Promise<ChatResult | null> {
    const {
      messages,
      conversationId,
      newConversation = false,
      regenerateMessageId,
      modelId,
      kbId,
    } = params

    logger.info('[ChatService] chat 参数', { conversationId, newConversation, kbId, modelId })

    if (!conversationId) {
      throw Errors.badRequest('缺少 conversationId 参数')
    }

    let convId = conversationId

    if (!convId && newConversation) {
      const newConv = await this.conversationService.create({})
      convId = newConv.id
    }

    if (!convId) {
      const latest = await this.conversationService.getLatest()
      if (latest) {
        convId = latest.id
      } else {
        const newConv = await this.conversationService.create({})
        convId = newConv.id
      }
    }

    await this.sseService.setProcessing(convId)

    if (regenerateMessageId) {
      await this.conversationService.removeMessagesAfter(convId, regenerateMessageId)
    }

    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      const userMessageId = createId()
      await this.conversationService.addMessage({
        conversationId: convId,
        role: 'user',
        content: lastMessage.content,
        tokens: 0,
        totalTokens: 0,
        memoried: false,
      })
      await this.sseService.emit({ type: 'messageId', role: 'user', id: userMessageId })
    }

    if (await this.sseService.isCancelled(convId)) {
      await this.sseService.clearCancelled(convId)
      await this.sseService.emit({ type: 'done' })
      return null
    }

    const graph = createChatGraph({
      prisma: this.prisma,
      conversationService: this.conversationService,
      searchService: this.searchService,
      chatMemoryService: this.chatMemoryService,
      chatSettingService: this.chatSettingService,
      chatModelFactory: this.chatModelFactory,
      sseService: this.sseService,
      providerService: this.providerService,
      modelService: this.modelService,
      kbService: this.kbService,
    })

    try {
      const result = await graph.invoke({
        conversationId: convId,
        modelId,
        kbId,
        agent: null as any,
        modelName: '',
        fullContent: '',
        userTokens: 0,
        userTotalTokens: 0,
        totalTokens: 0,
        completionTokens: 0,
        finishReason: '',
        searchResult: '',
        memoryText: '',
        cancelled: false,
        enableThinking: true,
        thinkingEffort: '',
        langchainMessages: [],
        finalMessages: [],
      })

      if (result.cancelled) {
        return null
      }

      return { conversationId: result.conversationId }
    } finally {
      logger.info('[ChatService] 清理 processing 状态', { conversationId: convId })
      await this.sseService.clearProcessing(convId)
    }
  }

  async cancelChat(conversationId: string): Promise<void> {
    await this.sseService.setCancelled(conversationId)
  }
}
