import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type {
  Conversation,
  ChatMessage,
  CreateConversationRequest,
  AddChatMessageRequest,
} from '@/src/types'
import { logger } from '@/src/lib/logger'
import { Errors } from '@/src/lib/errors'

export class ConversationService {
  private prisma: PrismaClient
  private static WELCOME_CONTENT = '你好！我是你的聊天伙伴，拥有联网搜索和记忆搜索能力。你可以向我提问任何问题，我会结合你的历史记忆和互联网信息为你解答。'

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  async create(data: CreateConversationRequest): Promise<Conversation> {
    const conversation = await this.prisma.conversation.create({
      data: {
        metadata: data.metadata as any,
        messages: {
          create: {
            role: 'assistant',
            content: ConversationService.WELCOME_CONTENT,
            tokens: 0,
            totalTokens: 0,
            metadata: { isWelcome: true },
          },
        },
      },
    })
    logger.info('[ConversationService] 创建对话并附带欢迎消息', { conversationId: conversation.id })
    return conversation as unknown as Conversation
  }

  async getLatest(): Promise<Conversation | null> {
    return this.prisma.conversation.findFirst({
      orderBy: { createdAt: 'desc' },
    }) as Promise<Conversation | null>
  }

  async addMessage(data: AddChatMessageRequest): Promise<ChatMessage> {
    return this.prisma.chatMessage.create({
      data: {
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        tokens: data.tokens || 0,
        totalTokens: data.totalTokens || 0,
        memoried: data.memoried || false,
        metadata: data.metadata as any,
      },
    }) as Promise<ChatMessage>
  }

  async list(options: {
    page?: number
    limit?: number
  }): Promise<{ conversations: Conversation[]; total: number; page: number; limit: number }> {
    logger.info('[Conversation] list', { page: options.page, limit: options.limit })

    const page = options.page || 1
    const limit = options.limit || 20
    const skip = (page - 1) * limit

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.conversation.count(),
    ])

    return {
      conversations: conversations as Conversation[],
      total,
      page,
      limit,
    }
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    }) as Promise<ChatMessage[]>
  }

  async get(conversationId: string): Promise<Conversation | null> {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    }) as Promise<Conversation | null>
  }

  async delete(conversationId: string): Promise<void> {
    await this.prisma.conversation.delete({
      where: { id: conversationId },
    })
  }

  async getMessage(messageId: string): Promise<ChatMessage | null> {
    return this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    }) as Promise<ChatMessage | null>
  }

  async removeMessagesAfter(conversationId: string, messageId: string): Promise<void> {
    const targetMessage = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { createdAt: true, memoried: true },
    })
    if (!targetMessage) {
      throw Errors.badRequest(`消息 ${messageId} 不存在`)
    }

    if (targetMessage.memoried) {
      throw Errors.badRequest('已记忆的消息不可重发')
    }

    await this.prisma.chatMessage.deleteMany({
      where: {
        conversationId,
        createdAt: { gte: targetMessage.createdAt },
      },
    })
  }

  async markMessageMemoried(messageId: string): Promise<void> {
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { memoried: true },
    })
  }

  async listMessages(options: {
    conversationId?: string
    role?: string
    page?: number
    limit?: number
  }): Promise<{ messages: ChatMessage[]; total: number; page: number; limit: number; conversationId: string }> {
    const page = options.page || 1
    const limit = options.limit || 50
    const skip = (page - 1) * limit

    logger.info('[ConversationService] listMessages 开始', { conversationId: options.conversationId, role: options.role, page, limit })

    let conversationId = options.conversationId
    if (!conversationId) {
      logger.info('[ConversationService] 未指定 conversationId，获取最新对话')
      const conversation = await this.getLatest()
      if (!conversation) {
        const newConversation = await this.create({})
        conversationId = newConversation.id
        logger.info('[ConversationService] 无已有对话，创建新对话', { conversationId })
      } else {
        conversationId = conversation.id
        logger.info('[ConversationService] 使用最新对话', { conversationId })
      }
    }

    const where: any = { conversationId }
    if (options.role) where.role = options.role

    let [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.chatMessage.count({ where }),
    ])

    if (total === 0) {
      const welcomeMessage = await this.addMessage({
        conversationId,
        role: 'assistant',
        content: ConversationService.WELCOME_CONTENT,
        tokens: 0,
        totalTokens: 0,
        metadata: { isWelcome: true },
      })
      messages = [welcomeMessage as any]
      total = 1
    }

    logger.info('[ConversationService] 查询消息完成', { conversationId, total, fetchedCount: messages.length })

    return {
      messages: messages as ChatMessage[],
      total,
      page,
      limit,
      conversationId,
    }
  }
}