import type { ChatState } from './types'
import type { GraphDependencies } from './index'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { StreamStatus } from '@/src/types'
import { Errors } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import { logger } from '@/src/lib/logger'

export function createSearchNode(deps: GraphDependencies) {
  async function buildSystemContext(searchResult: string, memoryText: string, recognizedText: string, agent: unknown) {
    const systemPrompt = Prompts.chatSystemRole(
      searchResult,
      memoryText,
      recognizedText,
    )
    const systemTokens = await deps.systemTokensService.getSystemTokens(systemPrompt, agent)
    return { systemPrompt, systemTokens }
  }

  return async function searchNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    if (state.langchainMessages.length < 1) {
      const { systemPrompt, systemTokens } = await buildSystemContext('', '', '', state.agent)
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
        state.agent as any,
        recentMessages
      )
    } catch (error) {
      deps.onError(error)
      throw error
    }

    let searchResult = ''
    let memoryText = ''
    let fetchedUrls: string[] = []

    if (searchNeeds.needSearchWeb && searchNeeds.webKeywords.length > 0) {
      await deps.sseService.emit({ type: 'status', status: StreamStatus.SearchingWeb })

      const cachedWebpages = await deps.searchService.getCachedWebpages(searchNeeds.webKeywords)

      let confirm = true
      try {
        confirm = await deps.searchService.confirmNeedSearchWeb(
          recentMessages,
          state.agent as any,
          cachedWebpages
        )
      } catch (error) {
        deps.onError(error)
        throw error
      }

      if (confirm) {
        const webpages = await deps.searchService.searchWeb(searchNeeds.webKeywords)
        fetchedUrls = webpages.map(w => w.url)
        searchResult = webpages.map(w =>
          `链接：${w.url}\n标题：${w.title}\n摘要：${w.summary}`
        ).join('\n\n')
      } else {
        const cachedItems = cachedWebpages.map(w => {
          if (!w.title) throw Errors.internalError(`网页 ${w.url} 缺少标题`)
          if (!w.summary) throw Errors.internalError(`网页 ${w.url} 缺少摘要`)
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
      state.recognizedText,
      state.agent,
    )

    logger.info('[ChatGraph] search 完成', {
      needSearchWeb: searchNeeds.needSearchWeb,
      needSearchMemory: searchNeeds.needSearchMemory,
    })

    let finalLangchainMessages = state.langchainMessages

    if (state.images && state.images.length > 0 && state.hasVisionCapability) {
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
    } else if (state.recognizedText) {
      const lastUserMsgIndex = finalLangchainMessages.findLastIndex(m => m instanceof HumanMessage)
      if (lastUserMsgIndex !== -1) {
        const originalMsg = finalLangchainMessages[lastUserMsgIndex]
        const originalContent = typeof originalMsg.content === 'string' ? originalMsg.content : ''
        const injectedContent = `${originalContent}\n\n[用户上传了图片，图片描述如下]\n${state.recognizedText}`
        finalLangchainMessages = [
          ...finalLangchainMessages.slice(0, lastUserMsgIndex),
          new HumanMessage({ content: injectedContent }),
          ...finalLangchainMessages.slice(lastUserMsgIndex + 1),
        ]
        if (state.lastUserMessageId) {
          await deps.conversationService.updateMessageContent(state.lastUserMessageId, injectedContent)
        }
      }
    }

    const mergedUrls = [...new Set([...state.urls, ...fetchedUrls])]

    const filledPrompt = Prompts.fillCurrentTime(systemPrompt)
    logger.info('[ChatGraph] 本轮系统提示词', { conversationId: state.conversationId, systemPrompt: filledPrompt })

    return {
      searchResult,
      memoryText,
      systemTokens,
      urls: mergedUrls,
      finalMessages: [new SystemMessage(filledPrompt), ...finalLangchainMessages],
    }
  }
}
