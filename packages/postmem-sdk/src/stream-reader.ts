import Redis from 'ioredis'
import type { StreamEvent, PostMemConfig } from './types'

const STREAM_KEY_PREFIX = 'chat:'
const POLL_INTERVAL_MS = 200

export class StreamReader {
  private redis: Redis

  constructor(config: PostMemConfig['redis']) {
    this.redis = new Redis({
      host: config.host,
      port: config.port,
      db: config.db ?? 5,
      password: config.password,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    })
  }

  async consume(
    conversationId: string,
    onEvent: (event: StreamEvent) => void,
  ): Promise<{ fullContent: string; promptTokens: number; completionTokens: number }> {
    const redisKey = `${STREAM_KEY_PREFIX}${conversationId}`
    let lastId = '0-0'
    let fullContent = ''
    let promptTokens = 0
    let completionTokens = 0

    while (true) {
      const result = await this.redis.xread('STREAMS', redisKey, lastId)

      if (result && result.length > 0) {
        const [, messages] = result[0]
        for (const [msgId, fields] of messages) {
          lastId = msgId
          const parsed: Record<string, string> = {}
          for (let i = 0; i < fields.length; i += 2) {
            parsed[fields[i]] = fields[i + 1]
          }

          const event: StreamEvent = JSON.parse(parsed.data)
          onEvent(event)

          if (event.type === 'chunk') {
            fullContent += event.content
          }
          if (event.type === 'usage') {
            promptTokens = event.promptTokens
            completionTokens = event.completionTokens
          }
          if (event.type === 'done' || event.type === 'error') {
            return { fullContent, promptTokens, completionTokens }
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit()
  }
}
