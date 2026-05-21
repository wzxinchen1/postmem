import { PostMemClient } from '@postmem/sdk'
import { PrismaClient } from '@/src/generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
import Redis from 'ioredis'

export function createSequentialGuard() {
  let failed = false
  let failedAt = ''
  return {
    guard: (name: string) => {
      if (failed) {
        throw new Error(`跳过: 前置用例 "${failedAt}" 失败`)
      }
    },
    markFailed: (name: string) => {
      failed = true
      failedAt = name
    },
  }
}

const BASE_URL = 'http://localhost:3000'
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || '192.168.50.236',
  port: Number(process.env.REDIS_PORT) || 6379,
  db: Number(process.env.REDIS_DB) || 5,
  password: process.env.REDIS_PASSWORD || undefined,
}

export function createClient(): PostMemClient {
  return new PostMemClient({ baseUrl: BASE_URL, requestTimeout: 30_000 })
}

export async function getTestKbId(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/kb/stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  const json = await res.json()
  const kbNames = json.data.kbNames
  if (!kbNames || kbNames.length === 0) {
    throw new Error('没有可用的知识库，请先创建知识库')
  }
  return kbNames[0].kbId
}

export async function getTestModelId(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/models/default?capability=chat`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`获取默认模型失败 (HTTP ${res.status}): ${text}`)
  }
  const json = await res.json()
  if (!json.data?.model?.id) {
    throw new Error('没有默认模型，请先配置模型')
  }
  return json.data.model.id
}

export function getBaseUrl(): string {
  return BASE_URL
}

export function getRedisConfig() {
  return REDIS_CONFIG
}

export async function cleanupConversations(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  await prisma.chatMessage.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.$disconnect()
}

export async function waitForProcessingCleared(conversationId: string, timeoutMs = 30_000): Promise<void> {
  const redis = new Redis(REDIS_CONFIG)
  const key = `chat:processing:${conversationId}`
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const exists = await redis.exists(key)
    if (exists === 0) {
      await redis.quit()
      return
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  await redis.quit()
  throw new Error(`等待 processing 状态清理超时 (${timeoutMs}ms), conversationId: ${conversationId}`)
}

export interface StreamEvent {
  type: string
  _timestamp?: number
  [key: string]: unknown
}

export interface ChatAndWaitResult {
  conversationId: string
  fullContent: string
  error?: string
  userTokens?: number
  userTotalTokens?: number
  totalTokens?: number
  completionTokens?: number
  reasoningTokens?: number
  events: StreamEvent[]
  requestStartTime: number
}

export async function chatAndWait(
  params: Record<string, unknown>,
  collectEvents = false,
): Promise<ChatAndWaitResult> {
  const requestStartTime = Date.now()

  const res = await fetch(`${BASE_URL}/api/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!res.ok) {
    const text = await res.text()
    throw { status: res.status, body: text }
  }

  const body = await res.json()
  const conversationId = body.data?.conversationId
  if (!conversationId) {
    throw new Error(`chat 返回无 conversationId: ${JSON.stringify(body)}`)
  }

  const events = await collectStreamEvents(conversationId)

  const result: ChatAndWaitResult = {
    conversationId,
    fullContent: '',
    events: collectEvents ? events : [],
    requestStartTime,
  }

  const doneEvent = events.find((e) => e.type === 'done') as Record<string, unknown> | undefined
  if (doneEvent) {
    result.error = doneEvent.error as string | undefined
    result.userTokens = doneEvent.userTokens as number | undefined
    result.userTotalTokens = doneEvent.userTotalTokens as number | undefined
    result.totalTokens = doneEvent.totalTokens as number | undefined
    result.completionTokens = doneEvent.completionTokens as number | undefined
    result.reasoningTokens = doneEvent.reasoningTokens as number | undefined
  }

  for (const e of events) {
    if (e.type === 'chunk') {
      result.fullContent += (e as any).content ?? ''
    }
  }

  return result
}

async function getStreamLastId(redis: Redis, streamKey: string): Promise<string> {
  const result = await redis.xrevrange(streamKey, '+', '-', 'COUNT', 1)
  if (result && result.length > 0) {
    return result[0][0]
  }
  return '0-0'
}

async function collectStreamEvents(conversationId: string): Promise<StreamEvent[]> {
  const redis = new Redis(REDIS_CONFIG)
  const streamKey = 'chat:global'
  const processingKey = `chat:processing:${conversationId}`
  const events: StreamEvent[] = []
  let lastId = await getStreamLastId(redis, streamKey)

  const start = Date.now()
  const timeout = 60_000

  while (Date.now() - start < timeout) {
    const processing = await redis.exists(processingKey)
    if (processing === 0 && events.length > 0) {
      break
    }

    const result = await redis.xread('STREAMS', streamKey, lastId)
    if (result && result.length > 0) {
      const [, messages] = result[0]
      for (const [msgId, fields] of messages) {
        lastId = msgId
        const parsed: Record<string, string> = {}
        for (let i = 0; i < fields.length; i += 2) {
          parsed[fields[i]] = fields[i + 1]
        }
        if (parsed.data) {
          try {
            const event = JSON.parse(parsed.data)
            event._timestamp = Date.now()
            events.push(event)
          } catch {}
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  await redis.quit()
  return events
}
