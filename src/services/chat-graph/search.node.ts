import type { ChatState } from './types'
import type { GraphDependencies } from './index'
import { SystemMessage } from '@langchain/core/messages'
import { StreamStatus } from '@/src/types'
import { AppError } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import { logger } from '@/src/lib/logger'

export function createSearchNode(deps: GraphDependencies) {
  async function buildSystemContext(searchResult: string, memoryText: string, agent: unknown, userProfile: string | null | undefined) {
    const userProfileArg = userProfile as string | undefined
    const systemPrompt = Prompts.chatSystemRole(
      searchResult,
      memoryText,
      undefined,
      userProfileArg,
    )
    const systemTokens = await deps.systemTokensService.getSystemTokens(systemPrompt, agent)
    return { systemPrompt, systemTokens }
  }

  function getLastUserQuery(recentMessages: { role: string; content: string }[]): string {
    const lastMsg = recentMessages[recentMessages.length - 1]
    if (!lastMsg) {
      throw new AppError('CHAT_SEARCH_MISSING_LAST_MESSAGE')
    }
    if (!lastMsg.content) {
      throw new AppError('CHAT_SEARCH_MISSING_LAST_MESSAGE')
    }
    return lastMsg.content
  }

  return async function searchNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    if (state.langchainMessages.length < 1) {
      const chatSetting = await deps.chatSettingService.get()
      const { systemPrompt, systemTokens } = await buildSystemContext('', '', state.agent, chatSetting.userProfile)
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

    const chatSetting = await deps.chatSettingService.get()
    const shouldSearchMemory = state.searchMemory === true
    const shouldSearchWeb = state.searchWeb === true

    if (!shouldSearchMemory && !shouldSearchWeb) {
      logger.info('[ChatGraph] 两类搜索均未触发，跳过')
    }

    const recentMessages = state.langchainMessages.slice(-6).map(msg => {
      let content: string
      if (typeof msg.content === 'string') {
        content = msg.content
      } else if (Array.isArray(msg.content)) {
        const parts: string[] = []
        for (const c of msg.content) {
          if (typeof c === 'string') {
            parts.push(c)
          } else {
            const textValue = (c as { text?: string }).text
            if (textValue === null || textValue === undefined) {
              throw new AppError('CHAT_MESSAGE_CONTENT_TEXT_MISSING')
            }
            parts.push(textValue)
          }
        }
        content = parts.join('')
      } else {
        content = ''
      }
      return {
        role: msg._getType() === 'human' ? 'user' as const : 'assistant' as const,
        content
      }
    })

    let searchResult = ''
    let memoryText = ''
    let fetchedUrls: string[] = []

    if (shouldSearchWeb) {
      const query = getLastUserQuery(recentMessages)
      const needsResult = await deps.searchService.analyzeSearchNeeds(
        state.agent as any,
        recentMessages,
        { includeWebSearch: true, includeMemorySearch: false }
      )
      const webKeywords = needsResult.webKeywords.length > 0 ? needsResult.webKeywords : [query]

      await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb, conversationId: state.conversationId })

      logger.info('[ChatGraph] 缓存查询', {
        webKeywords,
      })
      const cachedWebpages = await deps.searchService.getCachedWebpages(webKeywords)
      logger.info('[ChatGraph] 缓存查询结果', {
        cachedCount: cachedWebpages.length,
        cachedTitles: cachedWebpages.map(w => w.title),
      })

      let confirm = true
      confirm = await deps.searchService.confirmNeedSearchWeb(
        recentMessages,
        state.agent as any,
        cachedWebpages
      )
      logger.info('[ChatGraph] 缓存判断结果', {
        cachedCount: cachedWebpages.length,
        confirm,
        action: confirm ? '重新搜索' : '使用缓存',
      })

      if (confirm) {
        const webpages = await deps.searchService.searchWeb(webKeywords, state.conversationId)
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
          await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb, url: item.url, conversationId: state.conversationId })
          fetchedUrls.push(item.url)
        }
        await deps.searchService.saveWebpages(cachedItems)
        const cachedResult = cachedItems.map(w =>
          `链接：${w.url}\n标题：${w.title}\n摘要：${w.summary}`
        ).join('\n\n')
        searchResult = cachedResult
      }

      await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb, conversationId: state.conversationId })
    }

    if (shouldSearchMemory) {
      const lastUserMsg = [...recentMessages].reverse().find(m => m.role === 'user')
      if (lastUserMsg && lastUserMsg.content) {
        await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingMemory, conversationId: state.conversationId })

        const similarSummaries = await deps.chatMemoryService.searchSimilar(
          state.kbId,
          state.topicIds,
          lastUserMsg.content
        )
        memoryText = similarSummaries.map(s => s.content).join('\n\n')

        await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingMemory, conversationId: state.conversationId })
      }
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
      chatSetting.userProfile,
    )

    logger.info('[ChatGraph] search 完成', {
      shouldSearchMemory,
      shouldSearchWeb,
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
