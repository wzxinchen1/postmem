import type { ChatState } from './types'
import type { GraphDependencies } from './index'
import { SystemMessage } from '@langchain/core/messages'
import { StreamStatus } from '@/src/types'
import { AppError } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import { logger } from '@/src/lib/logger'

export function createSearchNode(deps: GraphDependencies) {
  async function buildSystemContext(searchResult: string, memoryText: string, agent: unknown, userProfile?: string) {
    const systemPrompt = Prompts.chatSystemRole(
      searchResult,
      memoryText,
      undefined,
      userProfile,
    )
    const systemTokens = await deps.systemTokensService.getSystemTokens(systemPrompt, agent)
    return { systemPrompt, systemTokens }
  }

  return async function searchNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    if (state.langchainMessages.length < 1) {
      const chatSetting = await deps.chatSettingService.get()
      const { systemPrompt, systemTokens } = await buildSystemContext('', '', state.agent, chatSetting.userProfile ?? undefined)
      return {
        searchResult: '',
        memoryText: '',
        systemTokens,
        finalMessages: [new SystemMessage(Prompts.fillCurrentTime(systemPrompt)), ...state.langchainMessages],
      }
    }

    if (await deps.sseService.isCancelled(state.conversationId)) {
      return { cancelled: true }
    }

    // 读取搜索启用状态，根据参数动态组合提示词
    const chatSetting = await deps.chatSettingService.get()
    const memorySearchEnabled = !chatSetting.memorySearchDisabled
    const webSearchEnabled = !chatSetting.webSearchDisabled
    const userProfile = chatSetting.userProfile ?? undefined

    // 如果两类搜索都被禁用，直接跳过分析
    if (!memorySearchEnabled && !webSearchEnabled) {
      logger.info('[ChatGraph] 两类搜索均已禁用，跳过分析')
      const { systemPrompt, systemTokens } = await buildSystemContext('', '', state.agent, userProfile)
      return {
        searchResult: '',
        memoryText: '',
        systemTokens,
        finalMessages: [new SystemMessage(Prompts.fillCurrentTime(systemPrompt)), ...state.langchainMessages],
      }
    }

    const recentMessages = state.langchainMessages.slice(-6).map(msg => {
      const content = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map(c => typeof c === 'string' ? c : ((c as any).text ?? '')).join('')
          : ''
      return {
        role: msg._getType() === 'human' ? 'user' as const : 'assistant' as const,
        content
      }
    })

    let searchNeeds: { needSearchWeb: boolean; webKeywords: string[]; needSearchMemory: boolean; memoryQuery: string | null }
    logger.info("判断是否需要搜索："+recentMessages[1].content);
    searchNeeds = await deps.searchService.analyzeSearchNeeds(
      state.agent as any,
      recentMessages,
      { includeWebSearch: webSearchEnabled, includeMemorySearch: memorySearchEnabled }
    )

    logger.info("判断结果", { searchNeeds });
    let searchResult = ''
    let memoryText = ''
    let fetchedUrls: string[] = []

    if (searchNeeds.needSearchWeb && searchNeeds.webKeywords.length > 0 && webSearchEnabled) {
      await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb })

      const cachedWebpages = await deps.searchService.getCachedWebpages(searchNeeds.webKeywords)

      let confirm = true
      confirm = await deps.searchService.confirmNeedSearchWeb(
        recentMessages,
        state.agent as any,
        cachedWebpages
      )

      if (confirm) {
        const webpages = await deps.searchService.searchWeb(searchNeeds.webKeywords)
        fetchedUrls = webpages.map(w => w.url)
        searchResult = webpages.map(w =>
          `链接：${w.url}\n标题：${w.title}\n摘要：${w.summary}`
        ).join('\n\n')
      } else {
        const cachedItems = cachedWebpages.map(w => {
          if (!w.title) throw new AppError('CHAT_SEARCH_WEBPAGE_MISSING_TITLE', { url: w.url })
          if (!w.summary) throw new AppError('CHAT_SEARCH_WEBPAGE_MISSING_SUMMARY', { url: w.url })
          return { url: w.url, title: w.title, content: w.content, summary: w.summary, keywords: w.keywords as string[] }
        })
        for (const item of cachedItems) {
          await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb, url: item.url })
          fetchedUrls.push(item.url)
        }
        await deps.searchService.saveWebpages(cachedItems)
        const cachedResult = cachedItems.map(w =>
          `链接：${w.url}\n标题：${w.title}\n摘要：${w.summary}`
        ).join('\n\n')
        searchResult = cachedResult
      }

      await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb })
    }

    if (searchNeeds.needSearchMemory && searchNeeds.memoryQuery) {
      await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingMemory })

      const similarSummaries = await deps.chatMemoryService.searchSimilar(
        state.kbId,
        searchNeeds.memoryQuery
      )
      memoryText = similarSummaries.map(s => s.content).join('\n\n')

      await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingMemory })
    }

    if (state.fetchedUrlContent) {
      searchResult = searchResult
        ? `${state.fetchedUrlContent}\n\n${searchResult}`
        : state.fetchedUrlContent
    }

    const { systemPrompt, systemTokens } = await buildSystemContext(
      searchResult,
      memoryText,
      state.agent,
      userProfile,
    )

    logger.info('[ChatGraph] search 完成', {
      needSearchWeb: searchNeeds.needSearchWeb,
      needSearchMemory: searchNeeds.needSearchMemory,
    })

    const mergedUrls = [...new Set([...state.urls, ...fetchedUrls])]

    const filledPrompt = Prompts.fillCurrentTime(systemPrompt)

    return {
      searchResult,
      memoryText,
      systemTokens,
      urls: mergedUrls,
      finalMessages: [new SystemMessage(filledPrompt), ...state.langchainMessages],
    }
  }
}
