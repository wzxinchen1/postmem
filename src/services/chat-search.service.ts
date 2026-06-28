import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { LLMResilienceService } from '@/src/services/llm-resilience.service'
import { AgentService } from '@/src/services/agent.service'
import type { IChatSettingProvider } from '@/src/interfaces/chat-setting-provider'
import { SSEService } from '@/src/services/sse.service'
import { Prompts } from '@/src/lib/prompts'
import { AppError } from '@/src/lib/errors'
import { logger } from '@/src/lib/logger'
import { StreamStatus } from '@/src/types'
import { searchWithTavily } from '@/src/services/thirdparty/tavily-client'
import { fetchUrlWithTimeout, checkAndParsePdf, extractHtmlContent } from '@/src/services/thirdparty/web-fetcher'

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

  async getCachedWebpages(keywords: string[]) {
    const results = await this.prisma.webPage.findMany({
      where: {
        keywords: { hasSome: keywords },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    })
    logger.info('[SearchService] getCachedWebpages', {
      queryKeywords: keywords,
      resultCount: results.length,
      resultTitles: results.map(r => r.title),
      resultKeywords: results.map(r => r.keywords),
    })
    return results
  }

  async confirmNeedSearchWeb(
    recentMessages: { role: 'user' | 'assistant'; content: string }[],
    agent: ChatOpenAI,
    cachedWebpages: any[]
  ): Promise<boolean> {
    if (cachedWebpages.length === 0) {
      logger.info('[SearchService] confirmNeedSearchWeb: 缓存为空，需要重新搜索')
      return true
    }

    const historyMessages = recentMessages.slice(0, -1)
    const historyText = historyMessages.length > 0
      ? `| 角色 | 内容 |\n|------|------|\n${historyMessages.map(m =>
        `| ${m.role === 'user' ? '用户' : 'AI'} | ${m.content.replace(/\n/g, ' ')} |`
      ).join('\n')}`
      : ''

    const lastMessage = recentMessages[recentMessages.length - 1]
    if (!lastMessage) {
      throw new AppError('CHAT_SEARCH_CONFIRM_MISSING_LAST_MESSAGE')
    }
    if (!lastMessage.content) {
      throw new AppError('CHAT_SEARCH_CONFIRM_MISSING_LAST_MESSAGE')
    }
    const currentQuery = lastMessage.content
    const webpagesText = cachedWebpages.map(w => {
      if (!w.title) throw new AppError('CHAT_SEARCH_WEBPAGE_MISSING_TITLE', { url: w.url })
      if (!w.summary) throw new AppError('CHAT_SEARCH_WEBPAGE_MISSING_SUMMARY', { url: w.url })
      const cacheTime = w.updatedAt
        ? new Date(w.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        : '未知'
      return `链接：${w.url}\n标题：${w.title}\n摘要：${w.summary}\n缓存时间：${cacheTime}`
    }).join('\n\n')

    const prompt = Prompts.confirmSearchWeb(historyText, currentQuery, webpagesText)

    const result = await this.llmResilienceService.invokeWithRetry({
      agent,
      messages: [new HumanMessage(prompt)],
      maxRetries: 2,
      timeoutMs: 120_000,
    })

    const rawContent = result.content.trim().toLowerCase()
    const matchedTrue = rawContent === 'true'
    const decision = matchedTrue ? true : rawContent.includes('true')
    logger.info('[SearchService] confirmNeedSearchWeb 结果', {
      cachedCount: cachedWebpages.length,
      llmRawResponse: result.content.trim(),
      decision: decision ? '需要重新搜索' : '缓存足够',
    })
    return decision
  }

  async searchWeb(keywords: string[], conversationId: string): Promise<WebpageResult[]> {
    if (!keywords) {
      throw new AppError('CHAT_SEARCH_KEYWORD_REQUIRED')
    }
    if (keywords.length === 0) {
      throw new AppError('CHAT_SEARCH_KEYWORD_REQUIRED')
    }

    logger.info('[SearchService] searchWeb 开始', { keywords, conversationId })

    const chatSetting = await this.chatSettingService.get()
    const linkCount = chatSetting.searchLinkCount

    const tavilyResults = await searchWithTavily(this.tavilyApiKey, keywords.join(' '), linkCount)

    const searchItems = tavilyResults.slice(0, linkCount)

    const fetchedWebpages: Array<{ url: string; title: string; content: string }> = []
    const skippedReasons: string[] = []
    for (const item of searchItems) {
      if (!item.title) {
        skippedReasons.push(`缺少标题: ${item.url}`)
        continue
      }
      const sourceContent = item.rawContent !== null && item.rawContent !== undefined
        ? item.rawContent
        : item.content
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
        await this.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb, url: wp.url, conversationId })
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
    const response = await fetchUrlWithTimeout(url, 10000)

    if (!response.ok) {
      throw new AppError('CHAT_SEARCH_URL_REQUEST_FAILED', { url, status: response.status, statusText: response.statusText })
    }

    const pdfContent = await checkAndParsePdf(response, url)
    if (pdfContent !== null) {
      return pdfContent
    }

    const html = await response.text()
    const content = extractHtmlContent(html, 5000)

    if (content.length <= 100) {
      throw new AppError('CHAT_SEARCH_URL_CONTENT_TOO_SHORT', { url })
    }
    return content
  }

  private async summarizeOne(agent: ChatOpenAI, webpage: { title: string; url: string; content: string }): Promise<SummaryItem> {
    const prompt = Prompts.webpageSummary(webpage)

    const result = await this.llmResilienceService.invokeWithRetry({
      agent,
      messages: [new HumanMessage(prompt)],
      maxRetries: 2,
      timeoutMs: 120_000,
    })

    if (!result.content) {
      throw new AppError('CHAT_SEARCH_SUMMARY_EMPTY', { url: webpage.url })
    }
    if (result.content.trim().length === 0) {
      throw new AppError('CHAT_SEARCH_SUMMARY_EMPTY', { url: webpage.url })
    }

    return { url: webpage.url, summary: result.content.trim() }
  }
}
