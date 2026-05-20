import type { ChatState } from './types'
import type { GraphDependencies } from './index'
import { DoneReason } from '@/src/types'
import { createId } from '@paralleldrive/cuid2'
import { logger } from '@/src/lib/logger'
import { Errors } from '@/src/lib/errors'

export function createStreamLLMNode(deps: GraphDependencies, isInsufficientBalanceError: (err: unknown) => boolean) {
  return async function streamLLMNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    const aiMessageId = createId()
    await deps.sseService.emit({ type: 'messageId', role: 'assistant', id: aiMessageId })

    let fullContent = ''
    let apiTotalPromptTokens = 0
    let completionTokens = 0
    let reasoningTokens = 0
    let finishReason = ''

    try {
      logger.info('[ChatGraph] streamLLM 开始', {
        conversationId: state.conversationId,
        thinkingEffort: (state as any).thinkingEffort,
        finalMessageCount: state.finalMessages.length,
      })
      const stream = await (state.agent as { stream: (messages: unknown[]) => AsyncIterable<Record<string, unknown>> }).stream(state.finalMessages)

      let thinkingCount = 0
      let chunkCount = 0

      for await (const chunk of stream) {
        if (chunk.usage_metadata) {
          const meta = chunk.usage_metadata as any
          logger.info('[ChatGraph] 原始 usage_metadata', { raw: JSON.stringify(meta) })
          if (typeof meta.input_tokens !== 'number') {
            throw Errors.internalError('LLM 响应 usage_metadata 缺少 input_tokens')
          }
          if (typeof meta.output_tokens !== 'number') {
            throw Errors.internalError('LLM 响应 usage_metadata 缺少 output_tokens')
          }
          apiTotalPromptTokens = meta.input_tokens
          const rawOutputTokens = meta.output_tokens
          reasoningTokens = meta.output_token_details?.reasoning ?? 0
          completionTokens = rawOutputTokens - reasoningTokens
        }

        const chunkAny = chunk as any
        if (chunkAny.response_metadata?.finish_reason) {
          finishReason = chunkAny.response_metadata.finish_reason
          logger.info('[ChatGraph] 收到 finish_reason', { finishReason })
        }

        if (chunkAny.additional_kwargs?.type === 'reasoning') {
          const thinkingContent = chunkAny.content ?? ''
          if (thinkingContent) {
            thinkingCount++
           if (await deps.sseService.isCancelled(state.conversationId)) {
              break
            }
            await deps.sseService.emit({ type: 'thinking', content: thinkingContent })
          }
          continue
        }

        const content = chunkAny.content ?? ''
        fullContent += content

        if (content) {
          chunkCount++
          if (await deps.sseService.isCancelled(state.conversationId)) {
            break
          }
          await deps.sseService.emit({
            type: 'chunk',
            content,
            model: { id: state.modelId, name: state.modelName },
          })
        }
      }
      logger.info('[ChatGraph] streamLLM 流结束', { thinkingCount, chunkCount, fullContentLength: fullContent.length })
    } catch (err) {
      deps.onError(err)
      if (isInsufficientBalanceError(err)) {
        logger.error('[ChatGraph] 提供商 API 欠费', { conversationId: state.conversationId, errorMessage: (err as Error).message })
        await deps.sseService.emit({ type: 'done', reason: DoneReason.InsufficientBalance })
      }
      throw err
    }

    const chatMessages = await deps.conversationService.getMessages(state.conversationId)
    const allHistory = chatMessages.filter(m => !m.memoried)
    const lastUserMsgIndex = allHistory.findLastIndex(m => m.role === 'user')
    const historyMessages = lastUserMsgIndex !== -1
      ? allHistory.slice(0, lastUserMsgIndex)
      : allHistory

    logger.info('[ChatGraph] 倒减开始', {
      apiInputTokens: apiTotalPromptTokens,
      messageCount: chatMessages.length,
      historyCount: historyMessages.length,
      allHistoryCount: allHistory.length,
    })

    let remaining = apiTotalPromptTokens
    for (const m of historyMessages) {
      remaining -= m.tokens
    }

    const userTokens = remaining - state.systemTokens
    const userTotalTokens = apiTotalPromptTokens
    const totalTokens = apiTotalPromptTokens + completionTokens + reasoningTokens

    logger.info('[ChatGraph] 倒减结果', {
      apiInputTokens: apiTotalPromptTokens,
      userTokens,
      userTotalTokens,
      totalTokens,
      reasoningTokens,
    })

    const allMessages = await deps.conversationService.getMessages(state.conversationId)
    const lastUserMsg = [...allMessages].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      await deps.conversationService.updateMessageTokens(lastUserMsg.id, userTokens, userTotalTokens)
    }

    if (finishReason === 'length') {
      logger.warn('[ChatGraph] 输出因达到 maxTokens 被截断', { conversationId: state.conversationId, completionTokens })
    }

    if (finishReason === 'content_filter' || finishReason === 'sensitive') {
      logger.warn('[ChatGraph] 输出因内容审核被拦截', { conversationId: state.conversationId, finishReason })
    }

    logger.info('[ChatGraph] streamLLM 完成', { userTokens, userTotalTokens, totalTokens, completionTokens, reasoningTokens, finishReason })

    return {
      fullContent,
      userTokens,
      userTotalTokens,
      totalTokens,
      completionTokens,
      reasoningTokens,
      finishReason,
    }
  }
}
