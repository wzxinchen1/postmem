import { ChatOpenAI } from '@langchain/openai'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { SSEService } from '@/src/services/sse.service'
import { KBService } from '@/src/services/kb.service'
import { AppError } from '@/src/lib/errors'
import { logger } from '@/src/lib/logger'
import type { ChatMessage } from '@/src/types'

interface IngestMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface Dependencies {
  prisma: PrismaClient
  sseService: SSEService
  kbService: KBService
}

export class ChatMemoryService {
  private prisma: PrismaClient
  private sseService: SSEService
  private kbService: KBService

  constructor({ prisma, sseService, kbService }: Dependencies) {
    this.prisma = prisma
    this.sseService = sseService
    this.kbService = kbService
  }

  async createMemory(
    messages: ChatMessage[],
    conversationId: string,
    kbId: string,
    agent: ChatOpenAI
  ): Promise<string[]> {
    const totalCharLength = messages.reduce((sum, m) => sum + m.content.length, 0)
    logger.info('[ChatMemoryService] createMemory', { messageCount: messages.length, totalCharLength, conversationId, kbId })

    const ingestMessages: IngestMessage[] = messages.map(m => ({
      id: String(m.id),
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }))

    const memorizedIds = await this.ingestMessages(kbId, ingestMessages, conversationId)

    return memorizedIds
  }

  async searchSimilar(
    kbId: string,
    topicIds: string[],
    query: string
  ): Promise<Array<{ id: string; content: string; score: number }>> {
    if (query.trim().length === 0) {
      throw new AppError('CHAT_MEMORY_QUERY_REQUIRED')
    }

    if (!topicIds || topicIds.length === 0) {
      throw new AppError('KB_SEARCH_TOPIC_IDS_REQUIRED')
    }

    const results = await this.kbService.search(kbId, topicIds, query, 5)
    return results.map(item => ({
      id: item.id,
      content: item.content,
      score: item.score,
    }))
  }

  private async ingestMessages(
    kbId: string,
    messages: IngestMessage[],
    conversationId: string
  ): Promise<string[]> {
    const result = await this.kbService.ingestMessages(kbId, messages, conversationId)
    return result.memorizedMessageIds
  }
}