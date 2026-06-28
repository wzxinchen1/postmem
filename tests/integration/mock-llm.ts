import type {
  LLMInvokeOptions,
  LLMInvokeResult,
  LLMStreamOptions,
  LLMStreamResult,
} from '../../src/services/llm-resilience.service'

// ─── 响应映射表 ─────────────────────────────────────────────

/**
 * 单条响应映射规则：当用户消息包含 keyword 时，返回对应 response。
 * 按数组顺序匹配，第一个命中即返回。
 */
export interface MockResponseRule {
  /** 匹配关键词（用户消息包含此字符串即命中） */
  keyword: string
  /** 命中后返回的回复内容 */
  response: string
}

const STORE_KEY = Symbol.for('postmem:test:llm-store')

interface LLMStore {
  /** 聊天响应映射规则表，按顺序匹配 */
  chatResponseRules: MockResponseRule[]
  /** 默认聊天回复（无规则命中时使用） */
  defaultChatResponse: string
  /** 识图回复 */
  visionResponse: string
  /** 联网搜索二次确认结果 */
  confirmSearchWebResult: boolean
  /** 网页摘要回复 */
  summaryResponse: string
  /** stream() 每个 chunk 的延迟（ms），0 = 无延迟 */
  streamChunkDelayMs: number
  /** MockChatAgent.invoke() 被调用的次数（校准走 invoke，聊天走 stream） */
  chatAgentInvokeCount: number
}

function getStore(): LLMStore {
  if (!(globalThis as any)[STORE_KEY]) {
    ;(globalThis as any)[STORE_KEY] = {
      chatResponseRules: [],
      defaultChatResponse: '这是 mock 的 LLM 回复，用于测试。',
      visionResponse: '这是一张测试图片的描述。',
      confirmSearchWebResult: true,
      summaryResponse: '这是 mock 的网页摘要。',
      streamChunkDelayMs: 50,
    }
  }
  return (globalThis as any)[STORE_KEY]
}

// ─── 控制函数 ───────────────────────────────────────────────

/** 设置聊天响应映射规则（替换整个规则表） */
export function setMockChatResponseRules(rules: MockResponseRule[]): void {
  getStore().chatResponseRules = rules
}

/** 追加一条聊天响应规则 */
export function addMockChatResponseRule(rule: MockResponseRule): void {
  getStore().chatResponseRules.push(rule)
}

/** 识图回复（vision agent 返回的内容，空字符串模拟识图失败） */
export function setMockVisionResponse(content: string): void {
  getStore().visionResponse = content
}

/** 设置默认聊天回复（无规则命中时使用） */
export function setMockChatResponse(content: string): void {
  getStore().defaultChatResponse = content
}

/** 设置 stream() 每个 chunk 的延迟（ms），0 = 无延迟 */
export function setMockStreamChunkDelay(ms: number): void {
  getStore().streamChunkDelayMs = ms
}

/** 动态设置联网搜索二次确认结果 */
export function setMockConfirmSearchWeb(result: boolean): void {
  getStore().confirmSearchWebResult = result
}

/** 动态设置网页摘要回复 */
export function setMockSummaryResponse(content: string): void {
  getStore().summaryResponse = content
}

export function getMockChatResponse(): string {
  return getStore().defaultChatResponse
}

/** 重置所有 mock 配置为默认值（每个测试前调用） */
export function resetMockLLMStore(): void {
  ;(globalThis as any)[STORE_KEY] = undefined
}

/** 获取 MockChatAgent.invoke() 被调用的次数（即校准次数） */
export function getCalibrateCallCount(): number {
  return getStore().chatAgentInvokeCount
}

/** 重置校准调用计数 */
export function resetCalibrateCallCount(): void {
  getStore().chatAgentInvokeCount = 0
}

// ─── 工具函数 ───────────────────────────────────────────────

function extractLastUserMessage(messages: unknown[]): string {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as any
    const content = typeof msg?.content === 'string'
      ? msg.content
      : Array.isArray(msg?.content)
        ? msg.content.map((c: any) => typeof c === 'string' ? c : (c?.text ?? '')).join('')
        : ''
    if (content) return content
  }
  return ''
}

/** 从消息数组中提取所有文本内容并 join，用于估算 input_tokens */
function joinMessagesText(messages: unknown[]): string {
  if (!Array.isArray(messages)) return ''
  return messages
    .map((msg: any) => {
      if (typeof msg?.content === 'string') return msg.content
      if (Array.isArray(msg?.content)) return msg.content.map((c: any) => typeof c === 'string' ? c : (c?.text ?? '')).join('')
      return ''
    })
    .join('')
}

// ─── Mock Chat Agent ────────────────────────────────────────

/**
 * Mock LLM Agent — 兼容 LangChain ChatModel 的 duck-typing 接口
 *
 * 响应策略：按 chatResponseRules 顺序匹配最后一条用户消息，
 * 第一个命中的规则返回对应 response；无命中则用 defaultChatResponse。
 */
class MockChatAgent {
  private getResponseContent(messages?: unknown[]): string {
    const store = getStore()

    if (messages) {
      const lastMsg = extractLastUserMessage(messages)
      if (lastMsg) {
        for (const rule of store.chatResponseRules) {
          if (lastMsg.includes(rule.keyword)) {
            return rule.response
          }
        }
      }
    }

    return store.defaultChatResponse
  }

  async *stream(messages: unknown[], options?: { signal?: AbortSignal }): AsyncIterable<Record<string, unknown>> {
    const store = getStore()
    const content = this.getResponseContent(messages)
    const inputTokens = joinMessagesText(messages).length || 100

    // 先发 usage_metadata（与真实 stream-llm.node.ts 的消费逻辑一致）
    yield {
      usage_metadata: {
        input_tokens: inputTokens,
        output_tokens: content.length,
        output_token_details: { reasoning: 0 },
      },
      response_metadata: { finish_reason: 'stop' },
    } as Record<string, unknown>

    // 分 chunk 发内容
    const chunkSize = 10
    for (let i = 0; i < content.length; i += chunkSize) {
      if (store.streamChunkDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, store.streamChunkDelayMs))
      }
      yield { content: content.slice(i, i + chunkSize) } as Record<string, unknown>
    }
  }

  async invoke(messages: unknown[], options?: { signal?: AbortSignal }): Promise<Record<string, unknown>> {
    getStore().chatAgentInvokeCount++
    const content = this.getResponseContent(messages)
    const inputTokens = joinMessagesText(messages).length || 100
    return {
      content,
      additional_kwargs: {},
      usage_metadata: {
        input_tokens: inputTokens,
        output_tokens: content.length,
      },
      response_metadata: { finish_reason: 'stop' },
    }
  }
}

/** 识图专用 mock agent */
class MockVisionAgent {
  async invoke(messages: unknown[], options?: { signal?: AbortSignal }): Promise<Record<string, unknown>> {
    const inputTokens = joinMessagesText(messages).length || 100
    return {
      content: getStore().visionResponse,
      additional_kwargs: {},
      usage_metadata: { input_tokens: inputTokens, output_tokens: 20 },
      response_metadata: { finish_reason: 'stop' },
    }
  }
}

// ─── Mock LLMResilienceService ──────────────────────────────

class MockLLMResilienceService {
  async invokeWithRetry(options: LLMInvokeOptions): Promise<LLMInvokeResult> {
    const lastMsg = extractLastUserMessage(options.messages)
    const promptTokens = joinMessagesText(options.messages).length || 50

    // confirmNeedSearchWeb 的调用：返回 true/false
    if (/是否需要.*搜索|缓存.*足够/.test(lastMsg) || lastMsg.length < 50) {
      const result = getStore().confirmSearchWebResult ? 'true' : 'false'
      return { content: result, usage: { promptTokens, completionTokens: result.length } }
    }

    // summarizeOne 的调用：返回摘要
    if (/摘要|总结|summar/.test(lastMsg)) {
      const summary = getStore().summaryResponse
      return { content: summary, usage: { promptTokens, completionTokens: summary.length } }
    }

    // 默认
    const content = getStore().defaultChatResponse
    return { content, usage: { promptTokens, completionTokens: content.length } }
  }

  async streamWithRetry(options: LLMStreamOptions): Promise<LLMStreamResult> {
    const content = getStore().defaultChatResponse
    const promptTokens = (typeof options.messages === 'string' ? options.messages : JSON.stringify(options.messages)).length || 100
    return {
      fullContent: content,
      usage: { promptTokens, completionTokens: content.length },
    }
  }

  parseJSON<T>(rawContent: string): T {
    try {
      return JSON.parse(rawContent) as T
    } catch {
      throw new Error(`Mock parseJSON 失败: ${rawContent.slice(0, 200)}`)
    }
  }
}

// ─── Mock ChatModelFactory ──────────────────────────────────

const mockChatModelFactory = {
  createAgent: () => new MockChatAgent(),
  hasAgent: (_key: string) => true,
  getAgent: (_key: string) => new MockChatAgent(),
  clearAll: () => {},
}

// ─── Mock AgentService ──────────────────────────────────────

const mockAgentService = {
  getChatAgent: async (_modelId: string, _thinkingEffort?: string) => new MockChatAgent(),
  getVisionAgent: async () => new MockVisionAgent(),
  getDefaultChatAgent: async () => new MockChatAgent(),
}

// ─── Mock SearchService ─────────────────────────────────────

import type { PrismaClient } from '../../src/generated/prisma/client/client'
import type { IChatSettingProvider } from '../../src/interfaces/chat-setting-provider'
import { SSEService } from '../../src/services/sse.service'
import { StreamStatus } from '../../src/types'

interface MockWebpageResult {
  url: string
  title: string
  content: string
  summary: string
  keywords: string[]
}

/**
 * Mock SearchService — 绕过 Tavily API 调用，保留数据库操作
 */
class MockSearchService {
  private prisma: PrismaClient
  private chatSettingService: IChatSettingProvider
  private sseService: SSEService

  constructor({ prisma, chatSettingService, sseService }: {
    prisma: PrismaClient
    chatSettingService: IChatSettingProvider
    sseService: SSEService
  }) {
    this.prisma = prisma
    this.chatSettingService = chatSettingService
    this.sseService = sseService
  }

  async getCachedWebpages(keywords: string[]) {
    return this.prisma.webPage.findMany({
      where: { keywords: { hasSome: keywords } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    })
  }

  async confirmNeedSearchWeb(
    recentMessages: { role: 'user' | 'assistant'; content: string }[],
    agent: unknown,
    cachedWebpages: any[]
  ): Promise<boolean> {
    if (!cachedWebpages || cachedWebpages.length === 0) return true
    return getStore().confirmSearchWebResult
  }

  async searchWeb(keywords: string[], conversationId: string): Promise<MockWebpageResult[]> {
    const chatSetting = await this.chatSettingService.get()
    const linkCount = chatSetting.searchLinkCount

    const mockWebpages: MockWebpageResult[] = Array.from(
      { length: Math.min(linkCount, 3) },
      (_, i) => ({
        url: `https://example.com/mock-result-${i + 1}`,
        title: `Mock 搜索结果 ${i + 1}: ${keywords.join(' ')}`,
        content: `这是关于「${keywords.join(' ')}」的 mock 搜索结果内容。用于测试，不涉及真实 API 调用。`,
        summary: getStore().summaryResponse,
        keywords,
      })
    )

    for (const wp of mockWebpages) {
      await this.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb, url: wp.url, conversationId })
    }

    await this.saveWebpages(mockWebpages)

    return mockWebpages
  }

  async saveWebpages(webpages: MockWebpageResult[]): Promise<void> {
    for (const wp of webpages) {
      const cleanContent = wp.content.replace(/\x00/g, '')
      const cleanTitle = wp.title.replace(/\x00/g, '')
      const cleanSummary = wp.summary.replace(/\x00/g, '')

      await this.prisma.webPage.upsert({
        where: { url: wp.url },
        update: {
          title: cleanTitle,
          content: cleanContent,
          summary: cleanSummary,
          keywords: wp.keywords,
        },
        create: {
          url: wp.url,
          title: cleanTitle,
          content: cleanContent,
          summary: cleanSummary,
          keywords: wp.keywords,
        },
      })
    }
  }

  async fetchUrlContent(url: string): Promise<string> {
    return `这是 mock 的 URL 内容: ${url}。用于测试，不涉及真实网络请求。`
  }
}

// ─── Mock CutModel Agent ──────────────────────────────────
//
// 与 MockChatAgent 不同，MockCutModelAgent 不依赖关键词匹配，
// 而是基于 system prompt 内容严格识别 CutModelService 的方法，
// 返回对应的合法 JSON。不会与 chat 用户的规则产生冲突。

class MockCutModelAgent {
  private getSystemPrompt(messages: unknown[]): string {
    if (!Array.isArray(messages) || messages.length === 0) return ''
    const first = messages[0] as any
    return typeof first?.content === 'string' ? first.content : ''
  }

  private getUserPrompt(messages: unknown[]): string {
    if (!Array.isArray(messages) || messages.length < 2) return ''
    const second = messages[1] as any
    return typeof second?.content === 'string' ? second.content : ''
  }

  async invoke(messages: unknown[], options?: { signal?: AbortSignal }): Promise<Record<string, unknown>> {
    const systemPrompt = this.getSystemPrompt(messages)
    const userPrompt = this.getUserPrompt(messages)
    const inputTokens = joinMessagesText(messages).length || 100

    let content: string
    if (systemPrompt.includes('文本处理专家') && systemPrompt.includes('切分')) {
      content = JSON.stringify({ chunks: [{ title: '测试片段', content: '这是 mock 的切片内容，用于测试记忆入库流程。' }] })
    } else if (systemPrompt.includes('知识库去重专家')) {
      content = JSON.stringify({ action: 'new', reason: 'mock 无重复，直接入库', targetId: null, mergedContent: null })
    } else if (systemPrompt.includes('主题分类助手')) {
      // createTopicInfo 和 batchResolveTopics 使用相同 system prompt，
      // 通过 user prompt 内容区分
      if (userPrompt.includes('创建一个新主题')) {
        // createTopicInfo 期望 { name, description }
        content = JSON.stringify({ name: '测试', description: 'mock 创建的主题' })
      } else {
        // batchResolveTopics 期望 { plans: [...] }
        // 测试环境已在 setup 中创建了"默认"主题，全部归入该主题
        content = JSON.stringify({ plans: [{ index: 0, action: 'select', topicName: '默认', reason: 'mock 分配到默认主题' }] })
      }
    } else if (systemPrompt.includes('对话分析专家')) {
      content = JSON.stringify({ groups: [{ messageIds: [], summary: 'mock 分组', isComplete: true }] })
    } else if (systemPrompt.includes('文本分析专家') || systemPrompt.includes('切割点')) {
      content = JSON.stringify({ cutPoints: [{ index: 0, reason: 'mock 切分点' }] })
    } else {
      content = getStore().defaultChatResponse
    }

    return {
      content,
      additional_kwargs: {},
      usage_metadata: { input_tokens: inputTokens, output_tokens: content.length },
      response_metadata: { finish_reason: 'stop' },
    }
  }
}

// ─── Mock Embedding Model ──────────────────────────────────
//
// EmbeddingService 需要 embedQuery() 方法，返回假向量即可。

class MockEmbeddingModel {
  async embedQuery(_text: string): Promise<number[]> {
    return Array.from({ length: 1024 }, () => Math.random() * 2 - 1)
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map(() => Array.from({ length: 1024 }, () => Math.random() * 2 - 1))
  }
}

// ─── Mock VendorService ───────────────────────────────────
//
// CutModelService 通过 vendorService.createModel() 创建 LangChain 模型，
// 此处让 createModel() 返回 MockCutModelAgent，通过 system prompt 严格匹配方法并返回合法 JSON。
// embedding 类型走 MockEmbeddingModel。

export function createMockVendorService(): Record<string, unknown> {
  return {
    createModel: (_vendor: unknown, params: unknown) => {
      const p = params as { modelType?: string }
      if (p?.modelType === 'embedding') {
        return new MockEmbeddingModel()
      }
      return new MockCutModelAgent()
    },
    list: async () => [],
    get: async (_id: string) => null,
    create: async (_data: unknown) => { throw new Error('MockVendorService: create 不支持') },
    update: async (_id: string, _data: unknown) => { throw new Error('MockVendorService: update 不支持') },
    delete: async (_id: string) => { throw new Error('MockVendorService: delete 不支持') },
    exists: async (_name: string, _excludeId?: string) => false,
  }
}

export const mockVendorServiceObj = createMockVendorService()

// ─── 导出 ───────────────────────────────────────────────────

export const mockLLMResilienceService = new MockLLMResilienceService()
export const mockChatModelFactoryObj = mockChatModelFactory
export const mockAgentServiceObj = mockAgentService
export { MockSearchService }
