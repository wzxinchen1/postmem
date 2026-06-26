import { redis } from '@/src/lib/redis'
import type { StreamEvent } from '@/src/types'
import { AppError } from '@/src/lib/errors'

export class SSEService {
  private readonly streamKeyPrefix = 'chat:stream:'
  private readonly activeSetKey = 'chat:active'
  private readonly cancelKeyPrefix = 'chat:cancel:'
  private readonly processingKeyPrefix = 'chat:processing:'

  async emit(event: StreamEvent): Promise<void> {
    if (!event.conversationId) {
      throw new AppError('INTERNAL_ERROR')
    }

    const streamKey = `${this.streamKeyPrefix}${event.conversationId}`

    await redis.xadd(streamKey, '*', 'event', 'message', 'data', JSON.stringify(event))
    await redis.sadd(this.activeSetKey, event.conversationId)
  }

  async getActiveConversations(): Promise<string[]> {
    return redis.smembers(this.activeSetKey)
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

  async clearMessageStream(conversationId?: string): Promise<void> {
    if (conversationId) {
      await redis.del(`${this.streamKeyPrefix}${conversationId}`)
      await redis.srem(this.activeSetKey, conversationId)
    } else {
      const active = await this.getActiveConversations()
      for (const convId of active) {
        await redis.del(`${this.streamKeyPrefix}${convId}`)
      }
      await redis.del(this.activeSetKey)
    }
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
