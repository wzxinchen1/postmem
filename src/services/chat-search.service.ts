import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { tavily } from '@tavily/core'
import { LLMResilienceService } from '@/src/services/llm-resilience.service'
import { AgentService } from '@/src/services/agent.service'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { SSEService } from '@/src/services/sse.service'
import { Prompts } from '@/src/lib/prompts'
import { Errors, AppError } from '@/src/lib/errors'
import { logger } from '@/src/lib/logger'
import { StreamStatus } from '@/src/types'
import type { SearchNeedsResult } from '@/src/types'

interface WebpageResult {
  url: string
  title: string
  content: string
  summary: string
  keywords: string[]
}

interface SummaryItem {
  url: string
  summary: string
}

interface Dependencies {
  prisma: PrismaClient
  llmResilienceService: LLMResilienceService
  agentService: AgentService
  chatSettingService: ChatSettingService
  sseService: SSEService
}

export class SearchService {
  private prisma: PrismaClient
  private llmResilienceService: LLMResilienceService
  private agentService: AgentService
  private chatSettingService: ChatSettingService
  private sseService: SSEService
  private tavilyApiKey: string

  constructor({ prisma, llmResilienceService, agentService, chatSettingService, sseService }: Dependencies) {
    this.prisma = prisma
    this.llmResilienceService = llmResilienceService
    this.agentService = agentService
    this.chatSettingService = chatSettingService
    this.sseService = sseService
    if (!process.env.TAVILY_API_KEY) throw Errors.internalError('缺少环境变量 TAVILY_API_KEY')
    this.tavilyApiKey = process.env.TAVILY_API_KEY
  }

  async analyzeSearchNeeds(
    agent: ChatOpenAI,
    recentMessages: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<SearchNeedsResult> {
    const historyMessages = recentMessages.slice(0, -1)
    const historyText = historyMessages.length > 0
      ? `| 角色 | 内容 |\n|------|------|\n${historyMessages.map(m =>
        `| ${m.role === 'user' ? '用户' : 'AI'} | ${m.content.replace(/\n/g, ' ')} |`
      ).join('\n')}`
      : ''

    const lastMessage = recentMessages[recentMessages.length - 1]
    logger.info('[SearchService] analyzeSearchNeeds 入参', {
      recentCount: recentMessages.length,
      messages: recentMessages.map(m => ({ role: m.role, contentLen: m.content?.length, contentPreview: m.content?.slice(0, 50) })),
    })
    if (!lastMessage?.content) throw Errors.badRequest('缺少最新消息内容')
    const currentQuery = lastMessage.content
    if (!currentQuery) {
      throw Errors.internalError('未找到最新消息内容')
    }

    const prompt = Prompts.searchNeedsAnalysis(historyText, currentQuery)

    const result = await this.llmResilienceService.invokeWithValidation<SearchNeedsResult>(
      {
        agent,
        messages: [new HumanMessage(prompt)],
        maxRetries: 3,
        timeoutMs: 120_000,
      },
      (parsed) => this.validateSearchNeedsResult(parsed)
    )

    return result.data
  }

  async getCachedWebpages(keywords: string[]) {
    return this.prisma.webPage.findMany({
      where: {
        keywords: { hasSome: keywords },
      },
      take: 5,
    })
  }

  async confirmNeedSearchWeb(
    recentMessages: { role: 'user' | 'assistant'; content: string }[],
    agent: ChatOpenAI,
    cachedWebpages: any[]
  ): Promise<boolean> {
    if (!cachedWebpages || cachedWebpages.length === 0) {
      return true
    }

    const historyMessages = recentMessages.slice(0, -1)
    const historyText = historyMessages.length > 0
      ? `| 角色 | 内容 |\n|------|------|\n${historyMessages.map(m =>
        `| ${m.role === 'user' ? '用户' : 'AI'} | ${m.content.replace(/\n/g, ' ')} |`
      ).join('\n')}`
      : ''

    const lastMessage = recentMessages[recentMessages.length - 1]
    if (!lastMessage?.content) throw Errors.badRequest('缺少最新消息内容')
    const currentQuery = lastMessage.content
    const webpagesText = cachedWebpages.map(w => {
      if (!w.title) throw Errors.internalError(`网页 ${w.url} 缺少标题`)
      if (!w.summary) throw Errors.internalError(`网页 ${w.url} 缺少摘要`)
      return `链接：${w.url}\n标题：${w.title}\n摘要：${w.summary}`
    }).join('\n\n')

    const prompt = Prompts.confirmSearchWeb(historyText, currentQuery, webpagesText)

    const result = await this.llmResilienceService.invokeWithRetry({
      agent,
      messages: [new HumanMessage(prompt)],
      maxRetries: 2,
      timeoutMs: 120_000,
    })

    const rawContent = result.content.trim().toLowerCase()
    return rawContent === 'true' || rawContent.includes('true')
  }

  async searchWeb(keywords: string[]): Promise<WebpageResult[]> {
    if (!keywords || keywords.length === 0) {
      throw Errors.badRequest('搜索关键词不能为空')
    }

    const chatSetting = await this.chatSettingService.get()
    const linkCount = chatSetting.searchLinkCount

    let tavilyResults: Array<{ url: string; title: string; content: string; raw_content?: string | null }>
    try {
      const client = tavily({ apiKey: this.tavilyApiKey })
      const response = await client.search(keywords.join(' '), {
        maxResults: linkCount,
        search_depth: 'advanced',
        include_raw_content: 'text',
      } as any)
      tavilyResults = response.results
      if (!tavilyResults || tavilyResults.length === 0) {
        throw Errors.internalError(`Tavily 未找到与关键词 "${keywords.join(', ')}" 相关的结果`)
      }
    } catch (e) {
      const originalError = e instanceof Error ? e : new Error(String(e))
      throw Errors.internalError(`Tavily 搜索失败: ${originalError.message}`)
    }

    const searchItems = tavilyResults.slice(0, linkCount)

    const fetchedWebpages: Array<{ url: string; title: string; content: string }> = []
    const skippedReasons: string[] = []
    for (const item of searchItems) {
      if (!item.title) {
        skippedReasons.push(`缺少标题: ${item.url}`)
        continue
      }
      const sourceContent = item.raw_content ?? item.content
      if (!sourceContent) {
        skippedReasons.push(`无正文: ${item.url}`)
        continue
      }
      fetchedWebpages.push({
        url: item.url,
        title: item.title,
        content: sourceContent,
      })
    }

    if (fetchedWebpages.length === 0) {
      const details = skippedReasons.length > 0 ? `: ${skippedReasons.join('; ')}` : ''
      throw Errors.internalError(`所有搜索结果均无法获取正文内容${details}`)
    }

    const summaryAgent = await this.agentService.getDefaultChatAgent() as ChatOpenAI

    const summaries: SummaryItem[] = []
    for (let i = 0; i < fetchedWebpages.length; i += 2) {
      const pair = fetchedWebpages.slice(i, i + 2)
      for (const wp of pair) {
        await this.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb, url: wp.url })
      }
      const results = await Promise.all(
        pair.map(wp => this.summarizeOne(summaryAgent, wp))
      )
      summaries.push(...results)
    }

    const summaryMap = new Map<string, string>()
    for (const item of summaries) {
      summaryMap.set(item.url, item.summary)
    }

    const webpages: WebpageResult[] = fetchedWebpages.map(wp => {
      const summary = summaryMap.get(wp.url)
      if (!summary) {
        throw Errors.internalError(`网页摘要生成失败: ${wp.url}`)
      }
      return {
        url: wp.url,
        title: wp.title,
        content: wp.content,
        summary,
        keywords,
      }
    })

    await this.saveWebpages(webpages)

    return webpages
  }

  async saveWebpages(webpages: WebpageResult[]): Promise<void> {
    for (const wp of webpages) {
      if (!wp.title) throw Errors.internalError(`网页 ${wp.url} 缺少标题`)
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
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        throw Errors.internalError(`链接 ${url} 请求失败: HTTP ${response.status} ${response.statusText}`)
      }

      const contentType = response.headers.get('content-type')
      const isPdf = contentType ? (contentType.includes('application/pdf') || url.endsWith('.pdf')) : url.endsWith('.pdf')

      if (isPdf) {
        try {
          const arrayBuffer = await response.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const pdfParse = await import('pdf-parse' as any)
          const pdfData = await (pdfParse as any).default(buffer)
          const content = pdfData.text.replace(/\s+/g, ' ').trim().slice(0, 5000)
          if (content.length <= 100) {
            throw Errors.internalError(`链接 ${url} 的 PDF 内容过短，可能为扫描件或空文档`)
          }
          return content
        } catch (err) {
          if (err instanceof AppError) throw err
          throw Errors.internalError(`链接 ${url} PDF 解析失败: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      const html = await response.text()
      const content = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000)

      if (content.length <= 100) {
        throw Errors.internalError(`链接 ${url} 正文内容过短，可能为空页面或需登录`)
      }
      return content
    } catch (err) {
      if (err instanceof AppError) throw err
      throw Errors.internalError(`链接 ${url} 获取失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async summarizeOne(agent: ChatOpenAI, webpage: { title: string; url: string; content: string }): Promise<SummaryItem> {
    const prompt = Prompts.webpageSummary(webpage)

    const result = await this.llmResilienceService.invokeWithRetry({
      agent,
      messages: [new HumanMessage(prompt)],
      maxRetries: 2,
      timeoutMs: 120_000,
    })

    if (!result.content || result.content.trim().length === 0) {
      throw Errors.internalError(`网页摘要返回空内容: ${webpage.url}`)
    }

    return { url: webpage.url, summary: result.content.trim() }
  }

  private validateSearchNeedsResult(parsed: unknown): SearchNeedsResult {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('解析结果不是有效对象')
    }

    const obj = parsed as Record<string, unknown>

    if (typeof obj.searchWebReason !== 'string') {
      throw new Error('searchWebReason 字段缺失或类型错误')
    }
    if (typeof obj.searchWebMemoryReason !== 'string') {
      throw new Error('searchWebMemoryReason 字段缺失或类型错误')
    }
    if (typeof obj.needSearchWeb !== 'boolean') {
      throw new Error('needSearchWeb 字段缺失或类型错误')
    }
    if (!Array.isArray(obj.webKeywords) || !obj.webKeywords.every((k: unknown) => typeof k === 'string')) {
      throw new Error('webKeywords 字段缺失或类型错误')
    }
    if (typeof obj.needSearchMemory !== 'boolean') {
      throw new Error('needSearchMemory 字段缺失或类型错误')
    }
    if (typeof obj.memoryQuery !== 'string' && obj.memoryQuery !== null) {
      throw new Error('memoryQuery 字段类型错误（必须为 string 或 null）')
    }

    return {
      searchWebReason: obj.searchWebReason,
      searchWebMemoryReason: obj.searchWebMemoryReason,
      needSearchWeb: obj.needSearchWeb,
      webKeywords: obj.webKeywords,
      needSearchMemory: obj.needSearchMemory,
      memoryQuery: obj.memoryQuery,
    }
  }
}
