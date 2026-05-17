import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { LLMResilienceService } from '@/src/services/llm-resilience.service'
import { Prompts } from '@/src/lib/prompts'
import { logger } from '@/src/lib/logger'
import type { SearchNeedsResult } from '@/src/types'

interface SearXNGResult {
  url: string
  title: string
  content?: string
}

interface Dependencies {
  prisma: PrismaClient
  llmResilienceService: LLMResilienceService
}

const DEFAULT_SEARCH_RESULT: SearchNeedsResult = {
  searchWebReason: '',
  searchWebMemoryReason: '',
  needSearchWeb: false,
  webKeywords: [],
  needSearchMemory: false,
  memoryQuery: null,
}

export class SearchService {
  private prisma: PrismaClient
  private llmResilienceService: LLMResilienceService
  private searxngUrl: string

  constructor({ prisma, llmResilienceService }: Dependencies) {
    this.prisma = prisma
    this.llmResilienceService = llmResilienceService
    this.searxngUrl = process.env.SEARXNG_URL || ''
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

    const currentQuery = recentMessages[recentMessages.length - 1]?.content || ''
    if (!currentQuery) {
      throw new Error('Current query not found')
    }

    const prompt = Prompts.searchNeedsAnalysis(historyText, currentQuery)

    try {
      const result = await this.llmResilienceService.invokeWithValidation<SearchNeedsResult>(
        {
          agent,
          messages: [new HumanMessage(prompt)],
          maxRetries: 3,
        },
        (parsed) => this.validateSearchNeedsResult(parsed)
      )

      return result.data
    } catch (error) {
      logger.error('[SearchService] 搜索需求分析失败，使用默认值（不搜索）', {
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return DEFAULT_SEARCH_RESULT
    }
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

    const currentQuery = recentMessages[recentMessages.length - 1]?.content || ''
    const webpagesText = cachedWebpages.map(w =>
      `链接：${w.url}\n标题：${w.title || ''}\n正文：${w.content}`
    ).join('\n\n')

    const prompt = Prompts.confirmSearchWeb(historyText, currentQuery, webpagesText)

    const result = await this.llmResilienceService.invokeWithRetry({
      agent,
      messages: [new HumanMessage(prompt)],
      maxRetries: 2,
    })

    const rawContent = result.content.trim().toLowerCase()
    return rawContent === 'true' || rawContent.includes('true')
  }

  async searchWeb(keywords: string[]): Promise<Array<{ url: string; title: string; content: string; keywords: string[] }>> {
    if (!this.searxngUrl) {
      return []
    }

    const url = `${this.searxngUrl}/search?q=${encodeURIComponent(keywords.join(' '))}&format=json&language=zh&categories=general,news`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return []
      }

      const data = await response.json()
      const results: SearXNGResult[] = data.results || []
      if (!results.length) {
        return []
      }

      const webpages: Array<{ url: string; title: string; content: string; keywords: string[] }> = []

      for (const item of results.slice(0, 10)) {
        const content = await this.extractWebContent(item.url)
        if (!content) continue

        webpages.push({
          url: item.url,
          title: item.title || '',
          content,
          keywords,
        })
      }

      return webpages
    } catch (e) {
      const originalError = e instanceof Error ? e : new Error(String(e))
      throw new Error(`SearXNG 搜索失败: ${url}`, { cause: originalError })
    }
  }

  async saveWebpages(webpages: Array<{ url: string; title: string; content: string; keywords: string[] }>): Promise<void> {
    for (const wp of webpages) {
      const cleanContent = wp.content.replace(/\x00/g, '')
      const cleanTitle = (wp.title || '').replace(/\x00/g, '')

      await this.prisma.webPage.upsert({
        where: { url: wp.url },
        update: {
          title: cleanTitle,
          content: cleanContent,
          keywords: wp.keywords,
        },
        create: {
          url: wp.url,
          title: cleanTitle,
          content: cleanContent,
          keywords: wp.keywords,
        },
      })
    }
  }

  private async extractWebContent(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) return null

      const contentType = response.headers.get('content-type') || ''
      const isPdf = contentType.includes('application/pdf') || url.endsWith('.pdf')

      if (isPdf) {
        try {
          const arrayBuffer = await response.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const pdfParse = await import('pdf-parse' as any)
          const pdfData = await (pdfParse as any).default(buffer)
          const content = pdfData.text.replace(/\s+/g, ' ').trim().slice(0, 5000)
          return content.length > 100 ? content : null
        } catch {
          return null
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

      return content.length > 100 ? content : null
    } catch {
      return null
    }
  }

  private validateSearchNeedsResult(parsed: unknown): SearchNeedsResult {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('解析结果不是有效对象')
    }

    const obj = parsed as Record<string, unknown>

    return {
      searchWebReason: typeof obj.searchWebReason === 'string' ? obj.searchWebReason : '',
      searchWebMemoryReason: typeof obj.searchWebMemoryReason === 'string' ? obj.searchWebMemoryReason : '',
      needSearchWeb: obj.needSearchWeb === true,
      webKeywords: Array.isArray(obj.webKeywords) ? obj.webKeywords.filter((k: unknown) => typeof k === 'string') : [],
      needSearchMemory: obj.needSearchMemory === true,
      memoryQuery: typeof obj.memoryQuery === 'string' ? obj.memoryQuery : null,
    }
  }
}