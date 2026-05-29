import { ChatService } from '@/src/services/chat.service'
import { ConversationService } from '@/src/services/conversation.service'
import { SSEService } from '@/src/services/sse.service'
import { ModelService } from '@/src/services/model.service'
import { KBService } from '@/src/services/kb.service'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import { logger } from '@/src/lib/logger'
import { AppError } from '@/src/lib/errors'
import { ThinkingEffort } from '@/src/types'

interface Deps {
  chatService: ChatService
  conversationService: ConversationService
  sseService: SSEService
  modelService: ModelService
  kbService: KBService
  chatSettingService: ChatSettingService
}

/**
 * 聊天补全 API
 * @response 200 - 成功响应
 */
export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['chatService', 'conversationService', 'sseService', 'modelService', 'kbService', 'chatSettingService'],
  handler: async (req, res, deps) => {
    const { messages, conversationId, newConversation, regenerateMessageId, modelId, kbId, thinkingEffort } = req.body

    if (!messages || !Array.isArray(messages) || (messages.length === 0 && !regenerateMessageId)) {
      return errorResponse('MISSING_MESSAGES')
    }

    if (!modelId) {
      return errorResponse('MISSING_MODEL_ID')
    }

    if (!kbId) {
      return errorResponse('MISSING_KB_ID')
    }

    const model = await deps.modelService.get(modelId)
    if (!model) {
      return errorResponse('MODEL_NOT_FOUND')
    }

    await deps.kbService.getKnowledgeBaseById(kbId)

    if (thinkingEffort !== undefined && !Object.values(ThinkingEffort).includes(thinkingEffort)) {
      return errorResponse('INVALID_THINKING_EFFORT', {
        allowedValues: Object.values(ThinkingEffort).join('/'),
        actual: thinkingEffort,
      })
    }

    const chatSetting = await deps.chatSettingService.get()
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
      const newConv = await deps.conversationService.create({})
      convId = newConv.id
    } else {
      const latest = await deps.conversationService.getLatest()
      if (latest) {
        convId = latest.id
      } else {
        const newConv = await deps.conversationService.create({})
        convId = newConv.id
      }
    }

    const processing = await deps.sseService.isProcessing(convId)
    if (processing) {
      logger.error('[completions] isProcessing 拦截', { convId, processing })
      return errorResponse('CHAT_PROCESSING')
    }

    if (regenerateMessageId) {
      const message = await deps.conversationService.getMessage(regenerateMessageId)
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

    // 所有校验通过后，在返回响应前设置 processing 标记，防止并发请求竞争
    await deps.sseService.setProcessing(convId)

    ; (async () => {
      try {
        await deps.chatService.chat({
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
          thinkingEffort,
        })
        logger.info('[completions] chat completed')
      } catch (error) {
        logger.error('[completions] Chat error', { modelId, kbId, conversationId: convId, error: error instanceof AppError ? error : { errorMessage: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined } })
      }
    })()

    return successResponse(res, { conversationId: convId })
  },
})

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}