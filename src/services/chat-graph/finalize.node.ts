import type { ChatState } from './types'
import type { GraphDependencies } from './index'
import { DoneReason } from '@/src/types'
import { logger } from '@/src/lib/logger'

export function createFinalizeNode(deps: GraphDependencies) {
  return async function finalizeNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      await deps.sseService.clearProcessing(state.conversationId)
      await deps.sseService.emit({ type: 'done', conversationId: state.conversationId })
      await deps.sseService.clearCancelled(state.conversationId)
      return {}
    }

    const isToolCall = state.finishReason === 'tool_calls' && state.toolCalls && state.toolCalls.length > 0

    if (isToolCall) {
      // tool_calls: 保存 assistant 消息（含 tool_calls 元数据），不计算 token 错误
      await deps.conversationService.addMessage({
        conversationId: state.conversationId,
        role: 'assistant',
        content: state.fullContent ? state.fullContent : JSON.stringify(state.toolCalls),
        tokens: state.completionTokens,
        totalTokens: state.totalTokens,
        reasoningTokens: state.reasoningTokens,
        memoried: false,
        name: state.modelName,
        urls: state.urls,
        metadata: { toolCalls: state.toolCalls } as Record<string, unknown>,
      })

      await deps.sseService.emit({
        type: 'done',
        reason: DoneReason.ToolCalls,
        toolCalls: state.toolCalls,
        userTokens: state.userTokens ?? undefined,
        userTotalTokens: state.userTotalTokens ?? undefined,
        totalTokens: state.totalTokens ?? undefined,
        completionTokens: state.completionTokens ?? undefined,
        reasoningTokens: state.reasoningTokens ?? undefined,
        conversationId: state.conversationId,
      })

      logger.info('[ChatGraph] finalize tool_calls', {
        conversationId: state.conversationId,
        toolCount: state.toolCalls.length,
      })

      return {}
    }

    // 正常文本回复
    await deps.conversationService.addMessage({
      conversationId: state.conversationId,
      role: 'assistant',
      content: state.fullContent,
      tokens: state.completionTokens,
      totalTokens: state.totalTokens,
      reasoningTokens: state.reasoningTokens,
      memoried: false,
      name: state.modelName,
      urls: state.urls,
    })

    const tokenError =
      !state.userTokens ? 'userTokens' :
        !state.userTotalTokens ? 'userTotalTokens' :
          !state.totalTokens ? 'totalTokens' :
            !state.completionTokens ? 'completionTokens' : null

    let reason: DoneReason | undefined
    if (state.finishReason === 'length') {
      reason = DoneReason.Truncated
    } else if (state.finishReason === 'content_filter' || state.finishReason === 'sensitive') {
      reason = DoneReason.ContentFiltered
    }

    await deps.sseService.emit({
      type: 'done',
      reason,
      error: tokenError
        ? `内部错误：${tokenError} 缺失或为0 (${tokenError}=${(state as any)[tokenError]})`
        : undefined,
      userTokens: state.userTokens ?? undefined,
      userTotalTokens: state.userTotalTokens ?? undefined,
      totalTokens: state.totalTokens ?? undefined,
      completionTokens: state.completionTokens ?? undefined,
      reasoningTokens: state.reasoningTokens ?? undefined,
      conversationId: state.conversationId,
    })

    logger.info('[ChatGraph] finalize 完成', { conversationId: state.conversationId })

    return {}
  }
}
