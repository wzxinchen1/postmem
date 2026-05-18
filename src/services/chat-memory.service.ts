import { ChatOpenAI } from '@langchain/openai'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { SSEService } from '@/src/services/sse.service'
import { KBService } from '@/src/services/kb.service'
import type { ChatMessage } from '@/src/types'

interface IngestMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface KbApiResponse<T> {
  success?: boolean
  data?: T
  error?: string
}

interface IngestSSEEvent {
  type: 'status' | 'progress' | 'chunk_detail' | 'complete' | 'error'
  message?: string
  data?: {
    current?: number
    total?: number
    memorizedMessageIds?: string[]
  }
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
  private readonly serverUrl: string

  constructor({ prisma, sseService, kbService }: Dependencies) {
    this.prisma = prisma
    this.sseService = sseService
    this.kbService = kbService
    this.serverUrl = process.env.MEMORY_SERVER_URL || 'http://localhost:3000'
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

    const memorizedIds = await this.ingestMessages(kbId, ingestMessages, conversationId)

    await this.sseService.emit({ type: 'status', status: 'summarizing' })

    return memorizedIds
  }

  async searchSimilar(
    kbId: string,
    query: string
  ): Promise<Array<{ id: string; content: string; score: number }>> {
    if (query.trim().length === 0) {
      return []
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
    messages: IngestMessage[],
    conversationId: string
  ): Promise<string[]> {
    const url = `${this.serverUrl}/api/kb/ingest`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kbId, messages }),
    })

    if (!response.ok) {
      throw new Error(`Ingest request failed with status ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/event-stream')) {
      const responseText = await response.text()
      const data: KbApiResponse<{ count: number; memoryIds: string[]; memorizedMessageIds: string[] }> = JSON.parse(responseText)
      if (data.error || !data.data) {
        throw new Error(data.error || 'Failed to ingest messages')
      }
      return data.data.memorizedMessageIds || []
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Failed to get response reader for SSE stream')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let memorizedMessageIds: string[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        const jsonStr = trimmed.slice(5).trim()
        if (!jsonStr) continue

        let event: IngestSSEEvent
        try {
          event = JSON.parse(jsonStr)
        } catch {
          continue
        }

        if (event.type === 'error') {
          throw new Error(event.message || 'Ingest failed')
        }

        if (event.type === 'complete') {
          if (event.data?.memorizedMessageIds) {
            memorizedMessageIds = event.data.memorizedMessageIds
          }
          continue
        }

        if (event.message) {
          await this.sseService.emit({ type: 'status', status: 'memoryProgress' })
        }
      }
    }

    return memorizedMessageIds
  }
}