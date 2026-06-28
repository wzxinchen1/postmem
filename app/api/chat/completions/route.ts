import { NextRequest } from 'next/server'
import { ChatService } from '@/src/services/chat.service'
import { ConversationService } from '@/src/services/conversation.service'
import { SSEService } from '@/src/services/sse.service'
import { ModelService } from '@/src/services/model.service'
import { KBService } from '@/src/services/kb.service'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { withErrorHandler } from '@/src/lib/with-error-handler'
import { successResponse, errorResponse } from '@/src/lib/api-utils'
import container from '@/src/lib/container'
import { logger } from '@/src/lib/logger'
import { formatErrorChain } from '@/src/lib/errors'
import { ThinkingEffort, type ChatCompletionRequest } from '@/src/types'

/**
 * 聊天补全（异步触发，结果通过 SSE 推送）
 * @swagger
 * @response 200 返回对话 ID
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const scope = container.createScope()
  const chatService = scope.resolve<ChatService>('chatService')
  const conversationService = scope.resolve<ConversationService>('conversationService')
  const sseService = scope.resolve<SSEService>('sseService')
  const modelService = scope.resolve<ModelService>('modelService')
  const kbService = scope.resolve<KBService>('kbService')
  const chatSettingService = scope.resolve<ChatSettingService>('chatSettingService')

  const body: ChatCompletionRequest = await request.json()
  const { messages, conversationId, newConversation, regenerateMessageId, modelId, kbId, topicIds, thinkingEffort, searchMemory, searchWeb } = body

  if (!messages || !Array.isArray(messages) || (messages.length === 0 && !regenerateMessageId)) {
    return errorResponse('MISSING_MESSAGES')
  }

  if (!modelId) {
    return errorResponse('MISSING_MODEL_ID')
  }

  if (!kbId) {
    return errorResponse('MISSING_KB_ID')
  }

  if (searchMemory && (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0)) {
    return errorResponse('KB_SEARCH_TOPIC_IDS_REQUIRED')
  }

  const model = await modelService.get(modelId)
  if (!model) {
    return errorResponse('MODEL_NOT_FOUND')
  }

  await kbService.getKnowledgeBaseById(kbId)

  if (thinkingEffort !== undefined && !Object.values(ThinkingEffort).includes(thinkingEffort)) {
    return errorResponse('INVALID_THINKING_EFFORT', {
      allowedValues: Object.values(ThinkingEffort).join('/'),
      actual: thinkingEffort,
    })
  }

  const chatSetting = await chatSettingService.get()
  if (chatSetting.memoryContextThreshold <= 0) {
    return errorResponse('INVALID_MEMORY_CONTEXT_THRESHOLD', {
      actual: chatSetting.memoryContextThreshold,
    })
  }

  const totalImages = messages.reduce((sum: number, m: { images?: unknown[] }) => sum + (m.images?.length ?? 0), 0)
  if (totalImages > 5) {
    return errorResponse('TOO_MANY_IMAGES', { max: 5, actual: totalImages })
  }

  const totalUrls = messages.reduce((sum: number, m: { urls?: unknown[] }) => sum + (m.urls?.length ?? 0), 0)
  if (totalUrls > 5) {
    return errorResponse('TOO_MANY_URLS', { max: 5, actual: totalUrls })
  }

  let convId: string

  if (conversationId) {
    convId = conversationId
  } else if (newConversation) {
    const newConv = await conversationService.create({})
    convId = newConv.id
  } else {
    const latest = await conversationService.getLatest()
    if (latest) {
      convId = latest.id
    } else {
      const newConv = await conversationService.create({})
      convId = newConv.id
    }
  }

  const processing = await sseService.isProcessing(convId)
  if (processing) {
    logger.error('[completions] isProcessing 拦截', { convId, processing })
    return errorResponse('CHAT_PROCESSING')
  }

  if (regenerateMessageId) {
    const message = await conversationService.getMessage(regenerateMessageId)
    if (!message) {
      return errorResponse('REGENERATE_MESSAGE_NOT_FOUND')
    }
    if (message.role !== 'user') {
      return errorResponse('REGENERATE_NOT_USER_MESSAGE')
    }
    if (message.memoried) {
      return errorResponse('MEMORIED_MESSAGE_CANNOT_REGENERATE')
    }
  }

  await sseService.setProcessing(convId)

  ;(async () => {
    try {
      await chatService.chat({
        messages: messages.map(m => ({
          id: m.id ? m.id : String(Date.now()),
          content: m.content,
          images: m.images,
          urls: m.urls,
        })),
        conversationId: convId,
        newConversation,
        regenerateMessageId,
        modelId,
        kbId,
        topicIds,
        thinkingEffort,
        searchMemory,
        searchWeb,
      })
      logger.info('[completions] chat completed')
    } catch (error) {
      logger.error('[completions] Chat error', { modelId, kbId, conversationId: convId, errorChain: formatErrorChain(error) })
    }
  })()

  return successResponse({ conversationId: convId })
})
