import { PostMemClient } from '../../packages/postmem-sdk/dist/index.mjs'
import { PrismaClient } from '../../src/generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
import Redis from 'ioredis'
import type { StreamEvent, ChatRequest } from '../../packages/postmem-sdk/dist/index.mjs'

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || '192.168.50.236',
  port: Number(process.env.REDIS_PORT) || 6379,
  db: Number(process.env.REDIS_DB) || 5,
  password: process.env.REDIS_PASSWORD || undefined,
}

export function getBaseUrl(): string {
  return BASE_URL
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

export async function cleanupConversations(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  await prisma.chatMessage.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.memory.deleteMany()
  await prisma.$disconnect()
}

export async function cleanupMemories(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  await prisma.memory.deleteMany()
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
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  await redis.quit()
  throw new Error(`等待 processing 状态清理超时 (${timeoutMs}ms), conversationId: ${conversationId}`)
}

type EventListener = (event: StreamEvent) => void

class EventDispatcher {
  private listeners: EventListener[] = []
  private started = false

  start(client: PostMemClient): void {
    if (this.started) return
    this.started = true

    client.consume((event) => {
      for (const listener of this.listeners) {
        listener(event)
      }
    }).catch(() => {})
  }

  addListener(listener: EventListener): void {
    this.listeners.push(listener)
  }

  removeListener(listener: EventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener)
  }
}

const dispatcher = new EventDispatcher()

export function startConsume(client: PostMemClient): void {
  dispatcher.start(client)
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
  client: PostMemClient,
  request: ChatRequest,
  collectEvents = false,
): Promise<ChatAndWaitResult> {
  const requestStartTime = Date.now()
  const events: StreamEvent[] = []
  const result: ChatAndWaitResult = {
    conversationId: '',
    fullContent: '',
    events: [],
    requestStartTime,
  }

  let listenerRef: EventListener | null = null
  const donePromise = new Promise<void>((resolve) => {
    const listener: EventListener = (event) => {
      if (collectEvents) {
        events.push({ ...event, _timestamp: Date.now() } as StreamEvent & { _timestamp: number })
      }

      if (event.type === 'chunk') {
        result.fullContent += event.content
      } else if (event.type === 'done') {
        result.error = event.error ?? undefined
        result.userTokens = event.userTokens
        result.userTotalTokens = event.userTotalTokens
        result.totalTokens = event.totalTokens
        result.completionTokens = event.completionTokens
        result.reasoningTokens = event.reasoningTokens
        dispatcher.removeListener(listener)
        resolve()
      } else if (event.type === 'error') {
        result.error = event.message
        dispatcher.removeListener(listener)
        resolve()
      }
    }

    listenerRef = listener
    dispatcher.addListener(listener)
  })

  let conversationId: string

  if (request.regenerateMessageId && (!request.messages || request.messages.length === 0)) {
    const res = await fetch(`${BASE_URL}/api/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!res.ok) {
      if (listenerRef) dispatcher.removeListener(listenerRef)
      const text = await res.text()
      throw new Error(`chat 请求失败 (HTTP ${res.status}): ${text}`)
    }
    const body = await res.json()
    conversationId = body.data?.conversationId ?? request.conversationId ?? ''
    if (!conversationId) {
      if (listenerRef) dispatcher.removeListener(listenerRef)
      throw new Error(`chat 返回无 conversationId: ${JSON.stringify(body)}`)
    }
  } else {
    conversationId = await client.chat(request)
  }

  result.conversationId = conversationId

  await donePromise
  result.events = events

  await waitForProcessingCleared(conversationId)

  return result
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`断言失败: ${message}`)
  }
}

export function assertEqual<T>(actual: T, expected: T, label?: string): void {
  if (actual !== expected) {
    const prefix = label ? `${label}: ` : ''
    throw new Error(`${prefix}期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

export function assertTruthy<T>(value: T, label?: string): void {
  if (!value) {
    const prefix = label ? `${label}: ` : ''
    throw new Error(`${prefix}期望值为真，实际 ${JSON.stringify(value)}`)
  }
}

export function assertGreaterThan(actual: number, threshold: number, label?: string): void {
  if (actual <= threshold) {
    const prefix = label ? `${label}: ` : ''
    throw new Error(`${prefix}期望 ${actual} > ${threshold}`)
  }
}

export function assertLessThanOrEqual(actual: number, threshold: number, label?: string): void {
  if (actual > threshold) {
    const prefix = label ? `${label}: ` : ''
    throw new Error(`${prefix}期望 ${actual} <= ${threshold}`)
  }
}

export function assertContains(haystack: string, needle: string, label?: string): void {
  if (!haystack.includes(needle)) {
    const prefix = label ? `${label}: ` : ''
    throw new Error(`${prefix}期望字符串包含 "${needle}"，实际 "${haystack}"`)
  }
}

export function assertNotEqual<T>(actual: T, expected: T, label?: string): void {
  if (actual === expected) {
    const prefix = label ? `${label}: ` : ''
    throw new Error(`${prefix}期望值不等于 ${JSON.stringify(expected)}，但实际相等`)
  }
}

export async function checkMessageTokens(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  try {
    const badMessages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { tokens: { lte: 0 } },
          { totalTokens: { lte: 0 } },
        ],
      },
      select: { id: true, role: true, tokens: true, totalTokens: true, conversationId: true },
    })
    if (badMessages.length > 0) {
      const details = badMessages.map(m => `id=${m.id} role=${m.role} tokens=${m.tokens} totalTokens=${m.totalTokens} convId=${m.conversationId}`)
      throw new Error(`发现 token 异常消息: ${details.join('; ')}`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

export { setMockChatSetting } from './di-overrides'