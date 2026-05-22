import { PostMemClient } from '../../packages/postmem-sdk/dist/index.mjs'
import { PrismaClient } from '../../src/generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
import Redis from 'ioredis'
import winston from 'winston'
import { SeqTransport } from '@datalust/winston-seq'
import type { StreamEvent, ChatRequest } from '../../packages/postmem-sdk/dist/index.mjs'

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`

// 测试日志：直接连 Seq，与每次聊天的 SSE 事件一一对应
export const testLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { application: 'postmem-test' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] [test]: ${message}`),
      ),
    }),
    ...(process.env.SEQ_URL
      ? [new SeqTransport({ serverUrl: process.env.SEQ_URL, apiKey: process.env.SEQ_API_KEY, onError: (e: Error) => console.error('[Seq] test transport error:', e) })]
      : []),
  ],
})

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
  /** 当前测试期间收集的搜索相关 status 事件 */
  private searchStatusEvents: string[] = []

  start(client: PostMemClient): void {
    if (this.started) return
    this.started = true

    client.consume((event) => {
      // 拦截搜索相关 status 事件，记录到当前测试的收集区
      if (event.type === 'status') {
        const status = (event as Record<string, unknown>).status as string
        if (status === 'searchingMemory' || status === 'searchingWeb') {
          this.searchStatusEvents.push(status)
        }
      }
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

  /** 获取当前测试期间收集的搜索事件，然后清空 */
  drainSearchEvents(): string[] {
    const events = this.searchStatusEvents
    this.searchStatusEvents = []
    return events
  }
}

const dispatcher = new EventDispatcher()

export function startConsume(client: PostMemClient): void {
  dispatcher.start(client)
}

/**
 * 框架层 post-check：验证搜索护栏生效。
 * searchAllowed=false 的测试不应出现搜索事件；searchAllowed=true 的测试允许搜索事件（仅清空收集区）。
 */
export async function assertNoSearchWhenDisabled(searchAllowed: boolean): Promise<void> {
  const searchEvents = dispatcher.drainSearchEvents()
  if (searchAllowed) {
    // 搜索测试允许产生搜索事件，清空即可
    return
  }
  if (searchEvents.length > 0) {
    throw new Error(
      `搜索护栏失效：声明 search=false 的测试出现了搜索事件 ${JSON.stringify(searchEvents)}。` +
      '该测试可能被搜索污染，请在 test() 选项中声明 { search: true } 或确保 searchDisabled 正确设置。'
    )
  }
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
  let chunkCount = 0
  const seqCid = request.conversationId || request.messages?.[request.messages.length - 1]?.id || '?'
  testLogger.info(`[chatAndWait] 开始`, { seqCid, request })

  const donePromise = new Promise<void>((resolve) => {
    const listener: EventListener = (event) => {
      events.push({ ...event, _timestamp: Date.now() } as StreamEvent & { _timestamp: number })

      if (event.type === 'chunk') {
        chunkCount++
        result.fullContent += event.content
        return
      }

      testLogger.info(`[chatAndWait] 收到事件 ${event.type}`, { seqCid, eventType: event.type, event })

      if (event.type === 'done') {
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
  testLogger.info(`[chatAndWait] 获取到 conversationId`, { seqCid, conversationId })

  await donePromise
  result.events = events
  testLogger.info(`[chatAndWait] 完成，共收到 ${events.length} 个事件`, {
    seqCid,
    conversationId,
    eventCount: events.length,
    eventTypes: events.map(e => e.type).join(', '),
  })

  // LLM 返回空内容时给出明确错误（仅成功响应时检查，error 终止时允许无内容）
  if (!result.fullContent && !result.error) {
    throw new Error(`LLM 返回了空内容 (conversationId=${conversationId})，可能是瞬时空响应或模型异常`)
  }

  // 框架层不变量：成功响应时 done 事件应无 error 且 token 计数有效
  if (result.error) {
    throw new Error(`聊天返回错误 (conversationId=${conversationId}): ${result.error}`)
  }
  if (result.userTokens !== undefined && result.userTokens <= 0) {
    throw new Error(`userTokens 异常 (conversationId=${conversationId}): ${result.userTokens}`)
  }
  if (result.completionTokens !== undefined && result.completionTokens <= 0) {
    throw new Error(`completionTokens 异常 (conversationId=${conversationId}): ${result.completionTokens}`)
  }
  if (result.totalTokens !== undefined && result.totalTokens <= 0) {
    throw new Error(`totalTokens 异常 (conversationId=${conversationId}): ${result.totalTokens}`)
  }

  // 框架层不变量：SSE 事件序列必须符合源码发射顺序
  // 源码链路: chat.service → messageId(user) → messageId(assistant) →
  //   [可选: status/thinking] → stream-llm → chunk+ → finalize → done
  //   异常时: ... → error（可能无 chunk）
  const isRegenerate = !!request.regenerateMessageId && (!request.messages || request.messages.length === 0)
  assertEventSequence(events, conversationId, isRegenerate)

  await waitForProcessingCleared(conversationId)

  return result
}

/**
 * 框架层不变量：验证 SSE 事件序列符合源码发射顺序。
 *
 * 每次流式聊天响应，源码保证的事件发射顺序分为两种情况：
 *
 * 正常聊天：
 *   1. messageId(role=user)      — chat.service.ts，graph 调用前
 *   2. messageId(role=assistant)  — chat.service.ts，graph 调用前
 *   3. chunk+ (成功时≥1个)        — stream-llm.node.ts
 *   4. done | error               — finalize.node.ts / onError 回调
 *
 * 重发（regenerateMessageId，无新用户消息）：
 *   1. messageId(role=assistant)  — chat.service.ts，graph 调用前
 *   2. chunk+ (成功时≥1个)
 *   3. done | error
 *
 * 中间可穿插 status/thinking 等可选事件，不影响必选事件的相对顺序。
 */
function assertEventSequence(events: StreamEvent[], conversationId: string, isRegenerate = false): void {
  const types = events.map((e) => e.type)

  // 1. 检查 messageId 事件
  const msgIdEvents = events.filter((e) => e.type === 'messageId')
  if (msgIdEvents.length === 0) {
    throw new Error(`SSE 序列异常 (conversationId=${conversationId}): 缺少 messageId 事件，收到类型 [${types.join(', ')}]`)
  }

  if (isRegenerate) {
    // 重发场景：无新用户消息，只发 messageId(assistant)
    const assistantMsgId = msgIdEvents.find((e) => (e as Record<string, unknown>).role === 'assistant')
    if (!assistantMsgId) {
      throw new Error(`SSE 序列异常 (conversationId=${conversationId}): 重发场景缺少 messageId(assistant)`)
    }
  } else {
    // 正常聊天场景：必须同时有 messageId(user) 和 messageId(assistant)
    const userMsgId = msgIdEvents.find((e) => (e as Record<string, unknown>).role === 'user')
    const assistantMsgId = msgIdEvents.find((e) => (e as Record<string, unknown>).role === 'assistant')
    if (!userMsgId) {
      throw new Error(`SSE 序列异常 (conversationId=${conversationId}): 缺少 messageId(user)`)
    }
    if (!assistantMsgId) {
      throw new Error(`SSE 序列异常 (conversationId=${conversationId}): 缺少 messageId(assistant)`)
    }
    // 验证顺序 user < assistant
    const firstUserIdx = types.indexOf('messageId')
    const asstIdx = types.indexOf('messageId', firstUserIdx + 1)
    const userRole = (msgIdEvents[0] as Record<string, unknown>).role
    const asstRole = (msgIdEvents[1] as Record<string, unknown>).role
    if (asstIdx <= firstUserIdx || userRole !== 'user' || asstRole !== 'assistant') {
      throw new Error(`SSE 序列异常 (conversationId=${conversationId}): messageId 顺序应为 user 先于 assistant，实际 [${msgIdEvents.map(e => (e as Record<string, unknown>).role).join(', ')}]`)
    }
  }

  // 2. 最后一个事件必须是 done 或 error
  const lastEvent = events[events.length - 1]
  if (lastEvent.type !== 'done' && lastEvent.type !== 'error') {
    throw new Error(`SSE 序列异常 (conversationId=${conversationId}): 最后一个事件应为 "done" 或 "error"，实际 "${lastEvent.type}"`)
  }

  // 3. 有序验证：messageId < [chunk+] < done|error
  const lastMsgIdIdx = types.lastIndexOf('messageId')
  const firstChunkIdx = types.indexOf('chunk')
  const terminalIdx = Math.max(types.lastIndexOf('done'), types.lastIndexOf('error'))

  if (firstChunkIdx !== -1 && firstChunkIdx <= lastMsgIdIdx) {
    throw new Error(`SSE 序列异常 (conversationId=${conversationId}): chunk 应在最后一个 messageId 之后 (chunk@${firstChunkIdx} <= lastMsgId@${lastMsgIdIdx})`)
  }
  if (firstChunkIdx !== -1 && terminalIdx <= firstChunkIdx) {
    throw new Error(`SSE 序列异常 (conversationId=${conversationId}): 终止事件应在 chunk 之后 (terminal@${terminalIdx} <= chunk@${firstChunkIdx})`)
  }
  // error 终止时允许没有 chunk；done 终止时必须有 chunk
  if (lastEvent.type === 'done' && firstChunkIdx === -1) {
    throw new Error(`SSE 序列异常 (conversationId=${conversationId}): done 终止但缺少 chunk 事件，LLM 未返回任何内容`)
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`断言失败: ${message}`)
  }
}

export function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  }
}

export function assertTruthy<T>(value: T, label: string): void {
  if (!value) {
    throw new Error(`${label}: 期望值为真，实际 ${JSON.stringify(value)}`)
  }
}

export function assertGreaterThan(actual: number, threshold: number, label: string): void {
  if (actual <= threshold) {
    throw new Error(`${label}: 期望 ${actual} > ${threshold}`)
  }
}

export function assertLessThanOrEqual(actual: number, threshold: number, label: string): void {
  if (actual > threshold) {
    throw new Error(`${label}: 期望 ${actual} <= ${threshold}`)
  }
}

export function assertContains(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: 期望字符串包含 "${needle}"，实际 "${haystack}"`)
  }
}

export function assertNotEqual<T>(actual: T, expected: T, label: string): void {
  if (actual === expected) {
    throw new Error(`${label}: 期望值不等于 ${JSON.stringify(expected)}，但实际相等`)
  }
}

/** 记忆搜索失败时的数据库诊断 — 查询 memories 表输出标题、内容及关键词命中情况 */
export async function diagnoseMemories(
  kbId: string,
  expectedKeywords: string[],
  llmReply: string,
): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  try {
    const memories = await prisma.memory.findMany({
      where: { kbId },
      select: { id: true, title: true, content: true },
    })

    const lines: string[] = ['\n═════ 记忆搜索诊断 ═════']
    lines.push(`KB 中的记忆总数: ${memories.length}`)
    lines.push('')
    for (const mem of memories) {
      const titleMatch = expectedKeywords.some(kw => mem.title.includes(kw))
      const contentMatch = expectedKeywords.some(kw => mem.content.includes(kw))
      lines.push(`  ── [${mem.id}]`)
      lines.push(`     title: "${mem.title}"`)
      lines.push(`     title 含关键词: ${titleMatch}`)
      lines.push(`     content 含关键词: ${contentMatch}`)
      lines.push(`     content 前 200 字: ${mem.content.substring(0, 200)}`)
      lines.push('')
    }
    lines.push(`LLM 回复前 200 字: ${llmReply.substring(0, 200)}`)
    lines.push(`LLM 回复含 "动态规划": ${llmReply.includes('动态规划')}`)
    lines.push(`LLM 回复含 "DP": ${llmReply.includes('DP')}`)
    lines.push(`LLM 回复含 "规划": ${llmReply.includes('规划')}`)
    lines.push('════════════════════════')

    throw new Error(lines.join('\n'))
  } finally {
    await prisma.$disconnect()
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

export { setMockChatSetting, setSearchDisabled, getSearchDisabled } from './di-overrides'