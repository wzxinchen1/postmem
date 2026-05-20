import { redis } from '@/src/lib/redis'
import type { StreamEvent } from '@/src/types'
import { DoneReason, StreamStatus } from '@/src/types'

export class SSEService {
  private readonly globalMessageKey = 'chat:global'
  private readonly cancelKeyPrefix = 'chat:cancel:'
  private readonly processingKeyPrefix = 'chat:processing:'

  async emit(event: StreamEvent): Promise<void> {
    await redis.xadd(this.globalMessageKey, '*', 'event', 'message', 'data', JSON.stringify(event))
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

  async clearMessageStream(): Promise<void> {
    await redis.del(this.globalMessageKey)
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
