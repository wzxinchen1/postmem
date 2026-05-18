import type { ChatState, GraphDependencies } from './types'
import { logger } from '@/src/lib/logger'

export function createFinalizeNode(deps: GraphDependencies) {
  return async function finalizeNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      await deps.sseService.clearProcessing(state.conversationId)
      await deps.sseService.emit({ type: 'done' })
      await deps.sseService.clearMessageStream()
      await deps.sseService.clearCancelled(state.conversationId)
      return {}
    }

    await deps.conversationService.addMessage({
      conversationId: state.conversationId,
      role: 'assistant',
      content: state.fullContent,
      tokens: state.completionTokens,
      totalTokens: state.totalTokens,
      memoried: false,
      name: state.modelName,
    })

    const tokenError =
      !state.userTokens ? 'userTokens' :
        !state.userTotalTokens ? 'userTotalTokens' :
          !state.totalTokens ? 'totalTokens' :
            !state.completionTokens ? 'completionTokens' : null

    await deps.sseService.emit({
      type: 'done',
      error: tokenError
        ? `内部错误：${tokenError} 缺失或为0 (${tokenError}=${(state as any)[tokenError]})`
        : undefined,
      userTokens: state.userTokens ?? undefined,
      userTotalTokens: state.userTotalTokens ?? undefined,
      totalTokens: state.totalTokens ?? undefined,
      completionTokens: state.completionTokens ?? undefined,
    })

    await deps.sseService.clearProcessing(state.conversationId)

    await new Promise(resolve => setTimeout(resolve, 1000))
    await deps.sseService.clearMessageStream()
    await deps.sseService.clearCancelled(state.conversationId)

    logger.info('[ChatGraph] finalize 完成', { conversationId: state.conversationId })

    return {}
  }
}
