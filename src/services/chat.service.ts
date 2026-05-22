import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { ConversationService } from '@/src/services/conversation.service'
import { SearchService } from '@/src/services/chat-search.service'
import { ChatMemoryService } from '@/src/services/chat-memory.service'
import type { IChatSettingProvider } from '@/src/interfaces/chat-setting-provider'
import { ChatModelFactory } from '@/src/services/chat-model-factory.service'
import { SSEService } from '@/src/services/sse.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { KBService } from '@/src/services/kb.service'
import { AgentService } from '@/src/services/agent.service'
import { SystemTokensService } from '@/src/services/system-tokens.service'
import { createChatGraph } from '@/src/services/chat-graph'
import { logger } from '@/src/lib/logger'
import { Errors, AppError } from '@/src/lib/errors'
import { createId } from '@paralleldrive/cuid2'
import type { ChatCompletionRequest, ChatMessageImage } from '@/src/types'

export interface ChatResult {
  conversationId: string
}

interface Dependencies {
  prisma: PrismaClient
  conversationService: ConversationService
  searchService: SearchService
  chatMemoryService: ChatMemoryService
  chatSettingService: IChatSettingProvider
  chatModelFactory: ChatModelFactory
  sseService: SSEService
  providerService: ProviderService
  modelService: ModelService
  kbService: KBService
  agentService: AgentService
  systemTokensService: SystemTokensService
}

export class ChatService {
  private prisma: PrismaClient
  private conversationService: ConversationService
  private searchService: SearchService
  private chatMemoryService: ChatMemoryService
  private chatSettingService: IChatSettingProvider
  private chatModelFactory: ChatModelFactory
  private sseService: SSEService
  private providerService: ProviderService
  private modelService: ModelService
  private kbService: KBService
  private agentService: AgentService
  private systemTokensService: SystemTokensService

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
    agentService,
    systemTokensService,
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
    this.agentService = agentService
    this.systemTokensService = systemTokensService
  }

  async chat(params: ChatCompletionRequest): Promise<ChatResult | null> {
    const {
      messages,
      conversationId,
      newConversation = false,
      regenerateMessageId,
      modelId,
      kbId,
      thinkingEffort,
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

    let images: ChatMessageImage[] = []
    let urls: string[] = []
    let userMessageId = ''

    if (regenerateMessageId) {
      const originalMessage = await this.conversationService.getMessage(regenerateMessageId)
      if (!originalMessage) {
        throw Errors.internalError(`消息 ${regenerateMessageId} 不存在`)
      }
      if (originalMessage.images) {
        images = originalMessage.images as ChatMessageImage[]
      }
      if (originalMessage.urls) {
        urls = originalMessage.urls as string[]
      }

      await this.conversationService.removeMessagesAfter(convId, regenerateMessageId)
    } else if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage.images) {
        images = lastMessage.images as ChatMessageImage[]
      }
      if (lastMessage.urls) {
        urls = lastMessage.urls as string[]
      }
      userMessageId = createId()
      const savedMessage = await this.conversationService.addMessageWithId({
        id: userMessageId,
        conversationId: convId,
        role: 'user',
        content: lastMessage.content,
        tokens: 0,
        totalTokens: 0,
        memoried: false,
        images: lastMessage.images,
        urls: lastMessage.urls,
      })
      await this.sseService.emit({ type: 'messageId', role: 'user', id: userMessageId, message: savedMessage })
    }

    const aiMessageId = createId()
    await this.sseService.emit({ type: 'messageId', role: 'assistant', id: aiMessageId })

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
      agentService: this.agentService,
      systemTokensService: this.systemTokensService,
      onError: (error) => {
        const appError = error instanceof AppError
          ? error
          : Errors.internalError(error instanceof Error ? error.message : String(error))
        logger.error('[ChatGraph] 流式响应异常', { conversationId: convId, errorMessage: appError.message, errorDetails: appError.details, stack: error instanceof Error ? error.stack : undefined })
        this.sseService.emit({ type: 'error', message: appError.message })
      },
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
        reasoningTokens: 0,
        finishReason: '',
        searchResult: '',
        memoryText: '',
        cancelled: false,
        thinkingEffort,
        langchainMessages: [],
        finalMessages: [],
        images,
        urls,
        hasVisionCapability: false,
        recognizedText: '',
        fetchedUrlContent: '',
        lastUserMessageId: userMessageId,
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
