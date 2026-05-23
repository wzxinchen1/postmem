import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { tavily } from '@tavily/core'
import { LLMResilienceService } from '@/src/services/llm-resilience.service'
import { AgentService } from '@/src/services/agent.service'
import type { IChatSettingProvider } from '@/src/interfaces/chat-setting-provider'
import { SSEService } from '@/src/services/sse.service'
import { Prompts } from '@/src/lib/prompts'
import { AppError } from '@/src/lib/errors'
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
  chatSettingService: IChatSettingProvider
  sseService: SSEService
}

export class SearchService {
  private prisma: PrismaClient
  private llmResilienceService: LLMResilienceService
  private agentService: AgentService
  private chatSettingService: IChatSettingProvider
  private sseService: SSEService
  private tavilyApiKey: string

  constructor({ prisma, llmResilienceService, agentService, chatSettingService, sseService }: Dependencies) {
    this.prisma = prisma
    this.llmResilienceService = llmResilienceService
    this.agentService = agentService
    this.chatSettingService = chatSettingService
    this.sseService = sseService
    if (!process.env.TAVILY_API_KEY) throw new AppError('CHAT_SEARCH_TAVILY_API_KEY_MISSING')
    this.tavilyApiKey = process.env.TAVILY_API_KEY
  }

  async analyzeSearchNeeds(
    agent: ChatOpenAI,
    recentMessages: { role: 'user' | 'assistant'; content: string }[],
    options?: { includeWebSearch?: boolean; includeMemorySearch?: boolean }
  ): Promise<SearchNeedsResult> {
    const historyText = this.buildHistoryText(recentMessages)
    const currentQuery = this.getCurrentQuery(recentMessages)

    const prompt = Prompts.searchNeedsAnalysis(historyText, currentQuery, options)

    const validateFn = (parsed: unknown) => this.validateSearchNeedsResult(parsed, options)

    const result = await this.llmResilienceService.invokeWithValidation<SearchNeedsResult>(
      {
        agent,
        messages: [new HumanMessage(prompt)],
        maxRetries: 3,
        timeoutMs: 120_000,
      },
      validateFn
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
    logger.info("二次判断缓存是否足够回答:" + cachedWebpages?.length);
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
    if (!lastMessage?.content) throw new AppError('CHAT_SEARCH_CONFIRM_MISSING_LAST_MESSAGE')
    const currentQuery = lastMessage.content
    const webpagesText = cachedWebpages.map(w => {
      if (!w.title) throw new AppError('CHAT_SEARCH_WEBPAGE_MISSING_TITLE', { url: w.url })
      if (!w.summary) throw new AppError('CHAT_SEARCH_WEBPAGE_MISSING_SUMMARY', { url: w.url })
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
      throw new AppError('CHAT_SEARCH_KEYWORD_REQUIRED')
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
        throw new AppError('CHAT_SEARCH_TAVILY_NO_RESULTS', { keywords: keywords.join(', ') })
      }
    } catch (e) {
      const originalError = e instanceof Error ? e : new Error(String(e))
      throw new AppError('CHAT_SEARCH_TAVILY_FAILED', undefined, originalError)
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
      throw new AppError('CHAT_SEARCH_ALL_RESULTS_UNAVAILABLE', { details })
    }

    const summaryAgent = await this.agentService.getDefaultChatAgent() as ChatOpenAI

    const concurrency = chatSetting.searchSummaryConcurrency
    const summaries: SummaryItem[] = []
    for (let i = 0; i < fetchedWebpages.length; i += concurrency) {
      const batch = fetchedWebpages.slice(i, i + concurrency)
      for (const wp of batch) {
        await this.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb, url: wp.url })
      }
      const results = await Promise.all(
        batch.map(wp => this.summarizeOne(summaryAgent, wp))
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
        throw new AppError('CHAT_SEARCH_SUMMARY_FAILED', { url: wp.url })
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
      if (!wp.title) throw new AppError('CHAT_SEARCH_WEBPAGE_MISSING_TITLE', { url: wp.url })
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
        throw new AppError('CHAT_SEARCH_URL_REQUEST_FAILED', { url, status: response.status, statusText: response.statusText })
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
            throw new AppError('CHAT_SEARCH_PDF_CONTENT_TOO_SHORT', { url })
          }
          return content
        } catch (err) {
          if (err instanceof AppError) throw err
          const pdfErr = err instanceof Error ? err : new Error(String(err))
          throw new AppError('CHAT_SEARCH_PDF_PARSE_FAILED', { url }, pdfErr)
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
        throw new AppError('CHAT_SEARCH_URL_CONTENT_TOO_SHORT', { url })
      }
      return content
    } catch (err) {
      if (err instanceof AppError) throw err
      const fetchErr = err instanceof Error ? err : new Error(String(err))
      throw new AppError('CHAT_SEARCH_URL_FETCH_FAILED', { url }, fetchErr)
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
      throw new AppError('CHAT_SEARCH_SUMMARY_EMPTY', { url: webpage.url })
    }

    return { url: webpage.url, summary: result.content.trim() }
  }

  private validateSearchNeedsResult(
    parsed: unknown,
    options?: { includeWebSearch?: boolean; includeMemorySearch?: boolean }
  ): SearchNeedsResult {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new AppError('CHAT_SEARCH_PARSE_RESULT_INVALID')
    }

    const obj = parsed as Record<string, unknown>

    const includeWeb = options?.includeWebSearch !== false
    const includeMemory = options?.includeMemorySearch !== false

    if (includeWeb) {
      if (typeof obj.searchWebReason !== 'string') {
        throw new AppError('CHAT_SEARCH_WEB_REASON_MISSING')
      }
      if (typeof obj.needSearchWeb !== 'boolean') {
        throw new AppError('CHAT_SEARCH_NEED_SEARCH_WEB_MISSING')
      }
      if (!Array.isArray(obj.webKeywords) || !obj.webKeywords.every((k: unknown) => typeof k === 'string')) {
        throw new AppError('CHAT_SEARCH_WEB_KEYWORDS_MISSING')
      }
    }

    if (includeMemory) {
      if (typeof obj.searchMemoryReason !== 'string') {
        throw new AppError('CHAT_SEARCH_MEMORY_REASON_MISSING')
      }
      if (typeof obj.needSearchMemory !== 'boolean') {
        throw new AppError('CHAT_SEARCH_NEED_SEARCH_MEMORY_MISSING')
      }
      if (typeof obj.memoryQuery !== 'string' && obj.memoryQuery !== null) {
        throw new AppError('CHAT_SEARCH_MEMORY_QUERY_TYPE_INVALID')
      }
    }

    return {
      searchWebReason: includeWeb ? (obj.searchWebReason as string) : '',
      searchMemoryReason: includeMemory ? (obj.searchMemoryReason as string) : '',
      needSearchWeb: includeWeb ? (obj.needSearchWeb as boolean) : false,
      webKeywords: includeWeb ? (obj.webKeywords as string[]) : [],
      needSearchMemory: includeMemory ? (obj.needSearchMemory as boolean) : false,
      memoryQuery: includeMemory ? (obj.memoryQuery as string | null) : null,
    }
  }

  private buildHistoryText(recentMessages: { role: string; content: string }[]): string {
    const historyMessages = recentMessages.slice(0, -1)
    return historyMessages.length > 0
      ? `| 角色 | 内容 |\n|------|------|\n${historyMessages.map(m =>
        `| ${m.role === 'user' ? '用户' : 'AI'} | ${m.content.replace(/\n/g, ' ')} |`
      ).join('\n')}`
      : ''
  }

  private getCurrentQuery(recentMessages: { role: string; content: string }[]): string {
    const lastMessage = recentMessages[recentMessages.length - 1]
    if (!lastMessage?.content) throw new AppError('CHAT_SEARCH_GET_CURRENT_QUERY_MISSING')
    const currentQuery = lastMessage.content
    if (!currentQuery) {
      throw new AppError('CHAT_SEARCH_CURRENT_QUERY_EMPTY')
    }
    return currentQuery
  }
}
