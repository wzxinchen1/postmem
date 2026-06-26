import type { ChatState } from './types'
import type { GraphDependencies } from './index'
import { HumanMessage } from '@langchain/core/messages'
import { logger } from '@/src/lib/logger'
import { AppError } from '@/src/lib/errors'
import type { ToolCall } from '@/src/types'

const STREAM_TIMEOUT_MS = 10_000

/**
 * 将识图描述注入到 finalMessages 的最后一条用户消息中，
 * 并同步更新数据库中的消息内容。
 * - 有 vision 能力时：将图片 URL 附加到消息 content（多模态格式）
 * - 无 vision 能力时：将识图文本拼接到消息 content（纯文本格式）
 */
async function injectImagesIntoMessages(state: ChatState, deps: GraphDependencies, messages: typeof state.finalMessages): Promise<typeof state.finalMessages> {
  let finalLangchainMessages = messages

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

  return finalLangchainMessages
}

export function createStreamLLMNode(deps: GraphDependencies) {
  return async function streamLLMNode(state: ChatState): Promise<Partial<ChatState>> {
    if (state.cancelled) {
      return {}
    }

    let fullContent = ''
    let apiTotalPromptTokens = 0
    let completionTokens = 0
    let reasoningTokens = 0
    let finishReason = ''
    const toolCallChunks = new Map<number, { name: string; id: string; args: string }>()

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)

    try {
      const messagesToStream = await injectImagesIntoMessages(state, deps, state.finalMessages)

      logger.info('[ChatGraph] streamLLM 开始', {
        conversationId: state.conversationId,
        thinkingEffort: (state as any).thinkingEffort,
        finalMessageCount: messagesToStream.length,
      })
      const stream = await (state.agent as { stream: (messages: unknown[], options?: { signal?: AbortSignal }) => AsyncIterable<Record<string, unknown>> }).stream(messagesToStream, { signal: controller.signal })
      clearTimeout(timeoutId)

      let thinkingCount = 0
      let chunkCount = 0

      for await (const chunk of stream) {
        if (chunk.usage_metadata) {
          const meta = chunk.usage_metadata as any
          logger.info('[ChatGraph] 原始 usage_metadata', { raw: JSON.stringify(meta) })
          if (typeof meta.input_tokens !== 'number') {
            throw new AppError('LLM_USAGE_MISSING_INPUT_TOKENS')
          }
          if (typeof meta.output_tokens !== 'number') {
            throw new AppError('LLM_USAGE_MISSING_OUTPUT_TOKENS')
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

        // 收集 tool_call_chunks（按 index 归并 args，因为分块传输时 args 可能是碎片）
        const chunkToolCalls = chunkAny.tool_call_chunks as Array<{ name?: string; id?: string; args?: string; index?: number }> | undefined
        if (chunkToolCalls && Array.isArray(chunkToolCalls)) {
          for (const tc of chunkToolCalls) {
            if (tc.index === undefined) continue
            const existing = toolCallChunks.get(tc.index)
            if (existing) {
              existing.args += tc.args ?? ''
            } else {
              toolCallChunks.set(tc.index, { name: tc.name ?? '', id: tc.id ?? '', args: tc.args ?? '' })
            }
          }
        }

        if (chunkAny.additional_kwargs?.type === 'reasoning') {
          const thinkingContent = chunkAny.content ?? ''
          if (thinkingContent) {
            thinkingCount++
           if (await deps.sseService.isCancelled(state.conversationId)) {
              break
            }
            await deps.sseService.emit({ type: 'thinking', content: thinkingContent, conversationId: state.conversationId })
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
            conversationId: state.conversationId,
          })
        }
      }
      clearTimeout(timeoutId)
      logger.info('[ChatGraph] streamLLM 流结束', { thinkingCount, chunkCount, fullContentLength: fullContent.length })
    } catch (err) {
      clearTimeout(timeoutId)
      if ((err as Error)?.name === 'AbortError') {
        throw new AppError('LLM_STREAM_TIMEOUT')
      }
      throw err
    }

    const chatMessages = await deps.conversationService.getMessages(state.conversationId)
    // 倒减只用未记忆消息的 token，已记忆消息的 token 是旧值（被记忆前计算的），不代表本轮实际消耗
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

    let toolCalls: ToolCall[] | undefined

    if (finishReason === 'tool_calls' && toolCallChunks.size > 0) {
      toolCalls = Array.from(toolCallChunks.values())
        .filter(tc => tc.id && tc.name)
        .map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.args },
        }))

      logger.info('[ChatGraph] LLM 请求调工具', {
        conversationId: state.conversationId,
        toolCount: toolCalls.length,
        tools: toolCalls.map(t => t.function.name),
      })
    }

    logger.info('[ChatGraph] streamLLM 完成', { userTokens, userTotalTokens, totalTokens, completionTokens, reasoningTokens, finishReason, toolCount: toolCalls?.length })

    return {
      fullContent,
      userTokens,
      userTotalTokens,
      totalTokens,
      completionTokens,
      reasoningTokens,
      finishReason,
      toolCalls,
    }
  }
}
