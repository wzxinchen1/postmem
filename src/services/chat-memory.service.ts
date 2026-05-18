import { ChatOpenAI } from '@langchain/openai'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { SSEService } from '@/src/services/sse.service'
import { KBService } from '@/src/services/kb.service'
import { Errors } from '@/src/lib/errors'
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
    await this.sseService.emit({ type: 'status', status: 'summarizing' })

    const ingestMessages: IngestMessage[] = messages.map(m => ({
      id: String(m.id),
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }))

    const memorizedIds = await this.ingestMessages(kbId, ingestMessages)

    await this.sseService.emit({ type: 'status', status: 'summarizing' })

    return memorizedIds
  }

  async searchSimilar(
    kbId: string,
    query: string
  ): Promise<Array<{ id: string; content: string; score: number }>> {
    if (query.trim().length === 0) {
      throw Errors.internalError('记忆搜索的 query 参数不能为空')
    }

    const results = await this.kbService.search(kbId, query, 5)
    return results.map(item => ({
      id: item.id,
      content: item.content,
      score: item.score,
    }))
  }

  private async ingestMessages(
    kbId: string,
    messages: IngestMessage[]
  ): Promise<string[]> {
    const result = await this.kbService.ingestMessages(kbId, messages)
    return result.memorizedMessageIds
  }
}