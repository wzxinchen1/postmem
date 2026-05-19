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

    let searchNeeds: { needSearchWeb: boolean; webKeywords: string[]; needSearchMemory: boolean; memoryQuery: string | null }
    try {
      searchNeeds = await deps.searchService.analyzeSearchNeeds(
        state.agent,
        recentMessages
      )
    } catch (error) {
      logger.error('[ChatGraph] searchNeeds 分析失败，跳过搜索', {
        error: error instanceof Error ? error : new Error(String(error)),
      })
      const systemPrompt = Prompts.chatSystemRole(
        state.fetchedUrlContent || '本轮对话没有触发搜索',
        '本轮对话没有触发记忆搜索'
      )
      return { searchResult: '', memoryText: '', finalMessages: [new SystemMessage(systemPrompt), ...state.langchainMessages] }
    }

    let searchResult = ''
    let memoryText = ''

    if (searchNeeds.needSearchWeb && searchNeeds.webKeywords.length > 0) {
      await deps.sseService.emit({ type: 'status', status: 'searchingWeb' })

      const cachedWebpages = await deps.searchService.getCachedWebpages(searchNeeds.webKeywords)

      let confirm = true
      try {
        confirm = await deps.searchService.confirmNeedSearchWeb(
          recentMessages,
          state.agent,
          cachedWebpages
        )
      } catch (error) {
        logger.error('[ChatGraph] confirmNeedSearchWeb 失败，默认执行搜索', {
          keywords: searchNeeds.webKeywords,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }

      if (confirm) {
        try {
          const webpages = await deps.searchService.searchWeb(searchNeeds.webKeywords)
          await deps.searchService.saveWebpages(webpages)
          searchResult = webpages.map(w =>
            `链接：${w.url}\n标题：${w.title}\n正文：${w.content}`
          ).join('\n\n')
        } catch (error) {
          logger.error('[ChatGraph] searchWeb 失败，降级为缓存结果', {
            keywords: searchNeeds.webKeywords,
            error: error instanceof Error ? error : new Error(String(error)),
          })
          const errorMsg = error instanceof Error ? error.message : String(error)
          try {
            const cachedResult = cachedWebpages.map(w => {
              if (!w.title) throw Errors.internalError(`网页 ${w.url} 缺少标题`)
              return `链接：${w.url}\n标题：${w.title}\n正文：${w.content}`
            }).join('\n\n')
            searchResult = cachedResult
              ? `[互联网搜索失败：${errorMsg}，以下为缓存结果]\n\n${cachedResult}`
              : `[互联网搜索失败：${errorMsg}，无缓存结果可用]`
          } catch (cacheError) {
            logger.error('[ChatGraph] 缓存结果格式异常', {
              error: cacheError instanceof Error ? cacheError : new Error(String(cacheError)),
            })
            searchResult = `[互联网搜索失败：${errorMsg}，且缓存数据异常，无法提供缓存结果]`
          }
        }
      } else {
        try {
          const cachedResult = cachedWebpages.map(w => {
            if (!w.title) throw Errors.internalError(`网页 ${w.url} 缺少标题`)
            return `链接：${w.url}\n标题：${w.title}\n正文：${w.content}`
          }).join('\n\n')
          searchResult = cachedResult
        } catch (cacheError) {
          logger.error('[ChatGraph] 缓存结果格式异常', {
            error: cacheError instanceof Error ? cacheError : new Error(String(cacheError)),
          })
          searchResult = ''
        }
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

    if (state.fetchedUrlContent) {
      searchResult = searchResult
        ? `${state.fetchedUrlContent}\n\n${searchResult}`
        : state.fetchedUrlContent
    }

    const systemPrompt = Prompts.chatSystemRole(
      searchResult || '本轮对话没有触发搜索',
      memoryText || '本轮对话没有触发记忆搜索'
    )

    logger.info('[ChatGraph] search 完成', {
      needSearchWeb: searchNeeds.needSearchWeb,
      needSearchMemory: searchNeeds.needSearchMemory,
    })

    let finalLangchainMessages = state.langchainMessages

    if (state.recognizedText) {
      const lastUserMsgIndex = finalLangchainMessages.findLastIndex(m => m instanceof HumanMessage)
      if (lastUserMsgIndex !== -1) {
        const originalMsg = finalLangchainMessages[lastUserMsgIndex]
        const originalContent = typeof originalMsg.content === 'string' ? originalMsg.content : ''
        const augmentedContent = `${originalContent}\n\n[图片描述]\n${state.recognizedText}`
        finalLangchainMessages = [
          ...finalLangchainMessages.slice(0, lastUserMsgIndex),
          new HumanMessage(augmentedContent),
          ...finalLangchainMessages.slice(lastUserMsgIndex + 1),
        ]
      }
    } else if (state.images && state.images.length > 0 && state.hasVisionCapability) {
      const lastUserMsgIndex = finalLangchainMessages.findLastIndex(m => m instanceof HumanMessage)
      if (lastUserMsgIndex !== -1) {
        const originalMsg = finalLangchainMessages[lastUserMsgIndex]
        const originalContent = typeof originalMsg.content === 'string' ? originalMsg.content : ''
        const imageContents = [
          { type: 'text' as const, text: originalContent },
          ...state.images.map(img => ({
            type: 'image_url' as const,
            image_url: { url: img.url },
          })),
        ]
        finalLangchainMessages = [
          ...finalLangchainMessages.slice(0, lastUserMsgIndex),
          new HumanMessage({ content: imageContents as any }),
          ...finalLangchainMessages.slice(lastUserMsgIndex + 1),
        ]
      }
    }

    return {
      searchResult,
      memoryText,
      finalMessages: [new SystemMessage(systemPrompt), ...finalLangchainMessages],
    }
  }
}
