import type { ChatState, GraphDependencies } from './types'
import { StreamStatus } from '@/src/types'
import { logger } from '@/src/lib/logger'

export function createFetchUrlNode(deps: GraphDependencies) {
  return async function fetchUrlNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    if (!state.urls || state.urls.length === 0) {
      return { fetchedUrlContent: '' }
    }

    await deps.sseService.emit({ type: 'status', status: StreamStatus.FetchingUrl })

    logger.info('[ChatGraph] fetchUrl 开始抓取', {
      conversationId: state.conversationId,
      urlCount: state.urls.length,
      urls: state.urls,
    })

    const contents: string[] = []

    for (const url of state.urls) {
      try {
        const content = await deps.searchService.fetchUrlContent(url)
        contents.push(`链接：${url}\n正文：${content}`)
      } catch (error) {
        logger.warn('[ChatGraph] fetchUrl 链接获取失败', { url, errorMessage: error instanceof Error ? error.message : String(error) })
      }
    }

    logger.info('[ChatGraph] fetchUrl 抓取完成', {
      conversationId: state.conversationId,
      successCount: contents.filter(c => c.includes('正文：')).length,
      totalUrls: state.urls.length,
    })

    const urlSection = contents.length > 0
      ? `以下是用户提到的链接：\n\n${contents.join('\n\n')}`
      : ''

    return { fetchedUrlContent: urlSection }
  }
}
