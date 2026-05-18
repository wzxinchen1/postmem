import type { ChatState, GraphDependencies } from './types'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { Errors } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import { logger } from '@/src/lib/logger'

export function createSearchNode(deps: GraphDependencies) {
  return async function searchNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    if (state.langchainMessages.length < 1) {
      const systemPrompt = Prompts.chatSystemRole(
        '本轮对话没有触发搜索',
        '本轮对话没有触发记忆搜索'
      )
      return {
        searchResult: '',
        memoryText: '',
        finalMessages: [new SystemMessage(systemPrompt), ...state.langchainMessages],
      }
    }

    if (await deps.sseService.isCancelled(state.conversationId)) {
      return { cancelled: true }
    }

    const recentMessages = state.langchainMessages.slice(-6).map(msg => {
      const content = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map(c => typeof c === 'string' ? c : ((c as any).text ?? '')).join('')
          : ''
      return {
        role: msg instanceof HumanMessage ? 'user' as const : 'assistant' as const,
        content
      }
    })

    logger.info('[ChatGraph] search recentMessages', {
      langchainCount: state.langchainMessages.length,
      recentCount: recentMessages.length,
      messages: recentMessages.map(m => ({ role: m.role, contentLen: m.content.length, contentPreview: m.content.slice(0, 50) })),
    })

    const searchNeeds = await deps.searchService.analyzeSearchNeeds(
      state.agent,
      recentMessages
    )

    let searchResult = ''
    let memoryText = ''

    if (searchNeeds.needSearchWeb && searchNeeds.webKeywords.length > 0) {
      await deps.sseService.emit({ type: 'status', status: 'searchingWeb' })

      const cachedWebpages = await deps.searchService.getCachedWebpages(searchNeeds.webKeywords)

      const confirm = await deps.searchService.confirmNeedSearchWeb(
        recentMessages,
        state.agent,
        cachedWebpages
      )

      if (confirm) {
        const webpages = await deps.searchService.searchWeb(searchNeeds.webKeywords)
        await deps.searchService.saveWebpages(webpages)
        searchResult = webpages.map(w =>
          `链接：${w.url}\n标题：${w.title}\n正文：${w.content}`
        ).join('\n\n')
      } else {
        searchResult = cachedWebpages.map(w => {
          if (!w.title) throw Errors.internalError(`网页 ${w.url} 缺少标题`)
          return `链接：${w.url}\n标题：${w.title}\n正文：${w.content}`
        }).join('\n\n')
      }

      await deps.sseService.emit({ type: 'status', status: 'searchingWeb' })
    }

    if (searchNeeds.needSearchMemory && searchNeeds.memoryQuery) {
      await deps.sseService.emit({ type: 'status', status: 'searchingMemory' })

      const similarSummaries = await deps.chatMemoryService.searchSimilar(
        state.kbId,
        searchNeeds.memoryQuery
      )
      memoryText = similarSummaries.map(s => s.content).join('\n\n')

      await deps.sseService.emit({ type: 'status', status: 'searchingMemory' })
    }

    const systemPrompt = Prompts.chatSystemRole(
      searchResult || '本轮对话没有触发搜索',
      memoryText || '本轮对话没有触发记忆搜索'
    )

    logger.info('[ChatGraph] search 完成', {
      needSearchWeb: searchNeeds.needSearchWeb,
      needSearchMemory: searchNeeds.needSearchMemory,
    })

    return {
      searchResult,
      memoryText,
      finalMessages: [new SystemMessage(systemPrompt), ...state.langchainMessages],
    }
  }
}
