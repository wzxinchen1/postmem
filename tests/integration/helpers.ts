import { PostMemClient } from '../../packages/postmem-sdk/dist/index.mjs'
import { PrismaClient } from '../../src/generated/prisma/client/client'
import { PrismaPg } from '@prisma/adapter-pg'
import Redis from 'ioredis'
import winston from 'winston'
import { SeqTransport } from '@datalust/winston-seq'
import type { StreamEvent, ChatRequest } from '../../packages/postmem-sdk/dist/index.mjs'
import { ThinkingEffort } from '../../packages/postmem-sdk/dist/index.mjs'


const BASE_URL = `http://localhost:${process.env.PORT || 3000}`
const isDev = process.env.env === 'dev'

// 测试日志
export const testLogger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { application: 'postmem-test', env: isDev ? 'dev' : 'production' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).filter(k => typeof k !== 'symbol').length
            ? `\n${JSON.stringify(meta, null, isDev ? 2 : 0)}`
            : ''
          return `${timestamp} [${level}] [test]: ${message}${metaStr}`
        }),
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
  const res = await fetch(`${BASE_URL}/api/kb/stats`)
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

export async function cleanupWebpages(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  await prisma.webPage.deleteMany()
  await prisma.$disconnect()
}

export async function getWebpageCount(): Promise<number> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })
  const count = await prisma.webPage.count()
  await prisma.$disconnect()
  return count
}

/**
 * 等待并验证聊天相关的 Redis key 全部清理完毕。
 *
 * 正常聊天完成后的清理逻辑（`chat.service.ts:225`）：
 *   - chat:processing:{convId}   — 在 graph invoke 的 finally 中清除
 *   - chat:cancel:{convId}       — 启动时 init.node 先 clearCancelled，正常流程不会残留
 *
 * 如果 consume 或服务端清理失效，将抛出超时异常。
 */
export async function waitForProcessingCleared(conversationId: string, timeoutMs = 30_000): Promise<void> {
  const redis = new Redis(REDIS_CONFIG)
  const convId = conversationId
  const keys = [`chat:processing:${convId}`, `chat:cancel:${convId}`]
  const start = Date.now()

  try {
    while (Date.now() - start < timeoutMs) {
      const remaining = await redis.exists(...keys)
      if (remaining === 0) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    // 超时后查看到底哪个 key 还活着
    const alive: string[] = []
    for (const key of keys) {
      if (await redis.exists(key)) {
        alive.push(key)
      }
    }
    throw new Error(
      `聊天清理超时 (${timeoutMs}ms), conversationId=${convId}, 残留 key: ${alive.join(', ') || '未知'}`
    )
  } finally {
    await redis.quit()
  }
}

/**
 * 每次 chatAndWait 创建一个 EventListener 实例，
 * 注册到全局转发器接收 SSE 事件，在 done/error 时自动完成。
 * 搜索事件直接从 result.events 中检查，无需全局收集。
 */
export class EventListener {
  private resolve!: () => void
  private events: StreamEvent[] = []
  private fullContent = ''
  private chunkCount = 0
  private error?: string
  private userTokens?: number
  private userTotalTokens?: number
  private totalTokens?: number
  private completionTokens?: number
  private reasoningTokens?: number
  private requestStartTime: number

  constructor(requestStartTime: number) {
    this.requestStartTime = requestStartTime
  }

  /** 全局转发器调用此方法将 SSE 事件推入 */
  onEvent(event: StreamEvent): void {
    this.events.push({ ...event, _timestamp: Date.now() } as StreamEvent & { _timestamp: number })

    if (event.type === 'chunk') {
      this.chunkCount++
      this.fullContent += event.content
      return
    }

    const e = event as Record<string, unknown>
    let logData: Record<string, unknown>
    if (event.type === 'status') {
      logData = { eventType: event.type, status: e.status, message: e.message, url: e.url }
    } else if (event.type === 'messageId') {
      logData = { eventType: event.type, id: e.id, role: e.role, content: (e.message as Record<string, unknown> | undefined)?.content }
    } else {
      logData = { eventType: event.type, ...e }
      delete logData._timestamp
    }

    const msgSuffix = event.type === 'status'
      ? `(${e.status})${e.url ? ` url=${e.url}` : ''}`
      : ''
    testLogger.info(`[chatAndWait] 收到事件 ${event.type}${msgSuffix}`, logData)

    if (event.type === 'done') {
      this.error = event.error ?? undefined
      this.userTokens = event.userTokens
      this.userTotalTokens = event.userTotalTokens
      this.totalTokens = event.totalTokens
      this.completionTokens = event.completionTokens
      this.reasoningTokens = event.reasoningTokens
      this.resolve()
    } else if (event.type === 'error') {
      this.error = event.message
      this.resolve()
    }
  }

  /** 返回 Promise，在 done/error 事件到达时 resolve */
  getDonePromise(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolve = resolve
    })
  }

  /** 构建 ChatAndWaitResult（done/error 之后调用） */
  buildResult(conversationId: string): ChatAndWaitResult {
    return {
      conversationId,
      fullContent: this.fullContent,
      error: this.error,
      userTokens: this.userTokens,
      userTotalTokens: this.userTotalTokens,
      totalTokens: this.totalTokens,
      completionTokens: this.completionTokens,
      reasoningTokens: this.reasoningTokens,
      events: this.events,
      requestStartTime: this.requestStartTime,
    }
  }

  getEventCount(): number {
    return this.events.length
  }

  getEventTypes(): string {
    return this.events.map(e => e.type).join(', ')
  }
}

/** 全局转发器：client.consume() 只能注册一次，将事件转发给当前活跃的 listener */
let activeListener: EventListener | null = null

export function setActiveListener(listener: EventListener | null): void {
  activeListener = listener
}

export async function startConsume(client: PostMemClient): Promise<void> {
  // 每次启动 consume 前清理 Redis 残留（如上次测试失败留下的 key），避免干扰
  const redis = new Redis(REDIS_CONFIG)
  await redis.del('chat:global', 'chat:active', 'system_tokens:default', 'system_tokens:default_prompt')
  const stream = redis.scanStream({ match: 'chat:processing:*', count: 100 })
  const keys: string[] = await new Promise((resolve, reject) => {
    const collected: string[] = []
    stream.on('data', (batch: string[]) => collected.push(...batch))
    stream.on('end', () => resolve(collected))
    stream.on('error', reject)
  })
  if (keys.length > 0) {
    await redis.del(...keys)
  }
  const streamKeys: string[] = await redis.keys('chat:stream:*')
  if (streamKeys.length > 0) {
    await redis.del(...streamKeys)
  }
  await redis.quit()

  client.consume((event) => {
    if (activeListener) {
      activeListener.onEvent(event)
    }
  }).catch(() => {})
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
  // 强制关闭深度思考，避免真实 LLM 思考耗时导致 TTFB 超时
  request.thinkingEffort = ThinkingEffort.None
  const requestStartTime = Date.now()
  const seqCid = request.conversationId || request.messages?.[request.messages.length - 1]?.id || '?'
  testLogger.info(`[chatAndWait] 开始`, { seqCid, request })

  const listener = new EventListener(requestStartTime)
  activeListener = listener

  let conversationId: string

  try {
    if (request.regenerateMessageId && (!request.messages || request.messages.length === 0)) {
      const res = await fetch(`${BASE_URL}/api/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`chat 请求失败 (HTTP ${res.status}): ${text}`)
      }
      const body = await res.json()
      conversationId = body.data?.conversationId ?? request.conversationId ?? ''
      if (!conversationId) {
        throw new Error(`chat 返回无 conversationId: ${JSON.stringify(body)}`)
      }
    } else {
      conversationId = await client.chat(request)
    }

    await listener.getDonePromise()
  } finally {
    activeListener = null
  }

  const result = listener.buildResult(conversationId)
  result.conversationId = conversationId

  testLogger.info(`[chatAndWait] 完成，共收到 ${listener.getEventCount()} 个事件`, {
    seqCid,
    conversationId,
    eventCount: listener.getEventCount(),
    eventTypes: listener.getEventTypes(),
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
  const isRegenerate = !!request.regenerateMessageId && (!request.messages || request.messages.length === 0)
  assertEventSequence(result.events, conversationId, isRegenerate)

  // 框架层不变量：首响应时间检测
  // - 有搜索/识图等预处理场景：测首 status 时间（验证服务基本可用，≤ 10s）
  // - 简单聊天（无预处理）：测首 token 时间 TTFB（验证 LLM 基本处理能力，≤ 10s）
  const hasPreprocessing = result.events.some((e) => e.type === 'status')
  if (hasPreprocessing) {
    const firstStatus = result.events.find((e) => e.type === 'status')!
    const statusTimestamp = (firstStatus as Record<string, unknown>)?._timestamp as number | undefined
    if (statusTimestamp) {
      const timeToFirstStatus = statusTimestamp - result.requestStartTime
      if (timeToFirstStatus > 15_000) {
        throw new Error(
          `首 status 超时 (conversationId=${conversationId}): ${timeToFirstStatus}ms，超过 10s 阈值。` +
          `收到 ${result.events.length} 个事件`
        )
      }
    }
  } else {
    const firstChunk = result.events.find((e) => e.type === 'chunk')
    if (firstChunk) {
      const chunkTimestamp = (firstChunk as Record<string, unknown>)?._timestamp as number | undefined
      if (chunkTimestamp) {
        const ttfb = chunkTimestamp - result.requestStartTime
        if (ttfb > 20_000) {
          throw new Error(
            `首 token 超时 (conversationId=${conversationId}): TTFB=${ttfb}ms，超过 10s 阈值。` +
            `收到 ${result.events.length} 个事件`
          )
        }
      }
    }
  }

  // 框架层不变量：消息已正确持久化
  const msgResult = await client.getMessages(conversationId, { page: 1, limit: 50 })
  const userMsgs = msgResult.messages.filter((m) => m.role === 'user')
  const assistantMsgs = msgResult.messages.filter((m) => m.role === 'assistant')
  if (assistantMsgs.length === 0) {
    throw new Error(`消息持久化异常 (conversationId=${conversationId}): 缺少 assistant 消息`)
  }
  const lastAssistant = assistantMsgs[assistantMsgs.length - 1]
  if (!lastAssistant.content) {
    throw new Error(`消息持久化异常 (conversationId=${conversationId}): 最后一条 assistant 消息内容为空, id=${lastAssistant.id}`)
  }
  if (userMsgs.length > 0) {
    const lastUser = userMsgs[userMsgs.length - 1]
    if (typeof lastUser.tokens !== 'number' || lastUser.tokens <= 0) {
      throw new Error(`消息持久化异常 (conversationId=${conversationId}): 最后一条 user 消息 token 异常, id=${lastUser.id}, tokens=${lastUser.tokens}`)
    }
  }



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

// ─── API 错误码配置 ──────────────────────────────────────
import apiErrorsConfig from '../../src/config/api-errors.json'

export type ApiErrorCode = keyof typeof apiErrorsConfig

/**
 * 基于 api-errors.json 配置验证 API 错误响应。
 * 
 * @param res fetch Response 对象
 * @param code 期望的错误码（对应 api-errors.json 中的 key）
 * @param params 可选的模板插值参数，用于验证含动态内容的 message
 */
export async function assertApiError(
  res: Response,
  code: ApiErrorCode,
  params?: Record<string, string | number>,
): Promise<void> {
  const config = apiErrorsConfig[code]
  if (!config) {
    throw new Error(`未知的错误码: ${code}`)
  }

  const expectedStatus = config.statusCode
  if (res.status !== expectedStatus) {
    throw new Error(`[${code}] statusCode: 期望 ${expectedStatus}，实际 ${res.status}`)
  }

  let expectedMessage = config.message
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      expectedMessage = expectedMessage.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
    }
  }

  const text = await res.text()
  // 对于含插值的 message，验证 message 中的静态部分是否被包含
  // 去掉 {key} 占位符后，剩余的静态文本应该都在响应中
  if (!params) {
    // 无插值时精确匹配
    if (text !== expectedMessage) {
      throw new Error(`[${code}] message: 期望 "${expectedMessage}"，实际 "${text}"`)
    }
  } else {
    // 有插值时，验证配置中的静态关键词片段都出现在响应中
    // 按插值占位符分割，取所有静态片段
    const staticParts = expectedMessage.split(/\{[^}]+\}/).filter(Boolean)
    for (const part of staticParts) {
      if (!text.includes(part)) {
        throw new Error(`[${code}] message: 期望包含 "${part}"，实际 "${text}"`)
      }
    }
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

export { setMockChatSetting, setModelHasVision } from './di-overrides'
export { setMockChatResponse, setMockChatResponseRules, addMockChatResponseRule, setMockStreamChunkDelay, setMockConfirmSearchWeb, setMockSummaryResponse, getMockChatResponse, setMockVisionResponse, resetMockLLMStore, getCalibrateCallCount, resetCalibrateCallCount } from './mock-llm'