import { redis } from '@/src/lib/redis'

export type StreamStatus =
  | 'searchingWeb'
  | 'searchingMemory'
  | 'summarizing'
  | 'memoryProgress'

export type StreamEvent =
  | { type: 'chunk'; content: string; model: { id: string; name: string } }
  | { type: 'status'; status: StreamStatus }
  | { type: 'messageId'; role: 'user' | 'assistant'; id: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done' }

export class SSEService {
  private readonly messageKeyPrefix = 'chat:'
  private readonly cancelKeyPrefix = 'chat:cancel:'
  private readonly processingKeyPrefix = 'chat:processing:'

  async emit(conversationId: string, event: StreamEvent): Promise<void> {
    const key = `${this.messageKeyPrefix}${conversationId}`
    await redis.xadd(key, '*', 'event', 'message', 'data', JSON.stringify(event))
  }

  async isCancelled(conversationId: string): Promise<boolean> {
    const key = `${this.cancelKeyPrefix}${conversationId}`
    const value = await redis.get(key)
    return value === 'true'
  }

  async setCancelled(conversationId: string): Promise<void> {
    const key = `${this.cancelKeyPrefix}${conversationId}`
    await redis.set(key, 'true')
  }

  async clearCancelled(conversationId: string): Promise<void> {
    const key = `${this.cancelKeyPrefix}${conversationId}`
    await redis.del(key)
  }

  async clearMessageStream(conversationId: string): Promise<void> {
    const key = `${this.messageKeyPrefix}${conversationId}`
    await redis.del(key)
  }

  async setProcessing(conversationId: string): Promise<void> {
    const key = `${this.processingKeyPrefix}${conversationId}`
    await redis.set(key, 'true')
  }

  async isProcessing(conversationId: string): Promise<boolean> {
    const key = `${this.processingKeyPrefix}${conversationId}`
    const value = await redis.get(key)
    return value === 'true'
  }

  async clearProcessing(conversationId: string): Promise<void> {
    const key = `${this.processingKeyPrefix}${conversationId}`
    await redis.del(key)
  }
}
