import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { LLMResilienceService } from '@/src/services/llm-resilience.service'
import { Prompts } from '@/src/lib/prompts'
import { Errors } from '@/src/lib/errors'
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

export class SearchService {
  private prisma: PrismaClient
  private llmResilienceService: LLMResilienceService
  private searxngUrl: string

  constructor({ prisma, llmResilienceService }: Dependencies) {
    this.prisma = prisma
    this.llmResilienceService = llmResilienceService
    if (!process.env.SEARXNG_URL) throw Errors.internalError('缺少环境变量 SEARXNG_URL')
    this.searxngUrl = process.env.SEARXNG_URL
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
    if (!lastMessage?.content) throw Errors.badRequest('缺少最新消息内容')
    const currentQuery = lastMessage.content
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
          timeoutMs: 120_000,
        },
        (parsed) => this.validateSearchNeedsResult(parsed)
      )

      return result.data
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error))
      throw Errors.internalError(`搜索需求分析失败: ${originalError.message}`)
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

    const lastMessage = recentMessages[recentMessages.length - 1]
    if (!lastMessage?.content) throw Errors.badRequest('缺少最新消息内容')
    const currentQuery = lastMessage.content
    const webpagesText = cachedWebpages.map(w => {
      if (!w.title) throw Errors.internalError(`网页 ${w.url} 缺少标题`)
      return `链接：${w.url}\n标题：${w.title}\n正文：${w.content}`
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

  async searchWeb(keywords: string[]): Promise<Array<{ url: string; title: string; content: string; keywords: string[] }>> {
    if (!keywords || keywords.length === 0) {
      throw Errors.badRequest('搜索关键词不能为空')
    }

    const url = `${this.searxngUrl}/search?q=${encodeURIComponent(keywords.join(' '))}&format=json&language=zh&categories=general,news`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw Errors.internalError(`SearXNG 请求失败: HTTP ${response.status}`)
      }

      const data = await response.json()
      const results: SearXNGResult[] = data.results
      if (!results || !Array.isArray(results)) {
        throw Errors.internalError('SearXNG 返回结果格式异常: 缺少 results 数组')
      }
      if (results.length === 0) {
        throw Errors.internalError(`SearXNG 未找到与关键词 "${keywords.join(', ')}" 相关的结果`)
      }

      const webpages: Array<{ url: string; title: string; content: string; keywords: string[] }> = []

      for (const item of results.slice(0, 10)) {
        const content = await this.extractWebContent(item.url)
        if (!content) continue
        if (!item.title) throw Errors.internalError(`搜索结果 ${item.url} 缺少标题`)

        webpages.push({
          url: item.url,
          title: item.title,
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
      if (!wp.title) throw Errors.internalError(`网页 ${wp.url} 缺少标题`)
      const cleanContent = wp.content.replace(/\x00/g, '')
      const cleanTitle = wp.title.replace(/\x00/g, '')

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

      const contentType = response.headers.get('content-type')
      const isPdf = contentType ? (contentType.includes('application/pdf') || url.endsWith('.pdf')) : url.endsWith('.pdf')

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