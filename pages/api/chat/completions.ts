import { ChatService } from '@/src/services/chat.service'
import { ConversationService } from '@/src/services/conversation.service'
import { SSEService } from '@/src/services/sse.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import { logger } from '@/src/lib/logger'
import { AppError } from '@/src/lib/errors'

interface Deps {
  chatService: ChatService
  conversationService: ConversationService
  sseService: SSEService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['chatService', 'conversationService', 'sseService'],
  handler: async (req, res, deps) => {
    const { messages, conversationId, newConversation, regenerateMessageId, modelId, kbId, thinkingEffort } = req.body

    if (!messages || !Array.isArray(messages) || (messages.length === 0 && !regenerateMessageId)) {
      return errorResponse(res, 'BAD_REQUEST', 'messages 不能为空')
    }

    if (!modelId) {
      return errorResponse(res, 'BAD_REQUEST', 'modelId 不能为空')
    }

    if (!kbId) {
      return errorResponse(res, 'BAD_REQUEST', 'kbId 不能为空')
    }

    const totalImages = messages.reduce((sum: number, m: { images?: unknown[] }) => sum + (m.images?.length ?? 0), 0)
    if (totalImages > 5) {
      return errorResponse(res, 'BAD_REQUEST', `单条消息最多支持 5 张图片，当前传入了 ${totalImages} 张`)
    }

    const totalUrls = messages.reduce((sum: number, m: { urls?: unknown[] }) => sum + (m.urls?.length ?? 0), 0)
    if (totalUrls > 5) {
      return errorResponse(res, 'BAD_REQUEST', `单条消息最多支持 5 个链接，当前传入了 ${totalUrls} 个`)
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
      return errorResponse(res, 'BAD_REQUEST', '上一次消息尚未处理完成，请等待后再试')
    }

    if (regenerateMessageId) {
      const message = await deps.conversationService.getMessage(regenerateMessageId)
      if (!message) {
        return errorResponse(res, 'BAD_REQUEST', `消息 ${regenerateMessageId} 不存在`)
      }
      if (message.memoried) {
        return errorResponse(res, 'BAD_REQUEST', '已记忆的消息不可重发')
      }
    }

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
        const errMsg = error instanceof AppError ? error.message : (error instanceof Error ? error.message : '内部错误')
        await deps.sseService.emit({ type: 'error', message: errMsg })
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