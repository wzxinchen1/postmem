import { redis } from '@/src/lib/redis'

export enum StreamStatus {
  SearchingWeb = 'searchingWeb',
  SearchingMemory = 'searchingMemory',
  Summarizing = 'summarizing',
  MemoryProgress = 'memoryProgress',
}

export enum DoneReason {
  Truncated = 'truncated',
  InsufficientBalance = 'insufficient_balance',
  ContentFiltered = 'content_filtered',
}

export type StreamEvent =
  | { type: 'chunk'; content: string; model: { id: string; name: string } }
  | { type: 'thinking'; content: string }
  | { type: 'status'; status: StreamStatus }
  | { type: 'messageId'; role: 'user' | 'assistant'; id: string }
  | { type: 'error'; message: string }
  | { type: 'done'; reason?: DoneReason; error?: string; userTokens?: number; userTotalTokens?: number; totalTokens?: number; completionTokens?: number; reasoningTokens?: number }

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
