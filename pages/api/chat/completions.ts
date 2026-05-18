import type { NextApiRequest, NextApiResponse } from 'next'
import { ChatService } from '@/src/services/chat.service'
import { ConversationService } from '@/src/services/conversation.service'
import { SSEService } from '@/src/services/sse.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import { logger } from '@/src/lib/logger'

interface Deps {
  chatService: ChatService
  conversationService: ConversationService
  sseService: SSEService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['chatService', 'conversationService', 'sseService'],
  handler: async (req, res, deps) => {
    const { messages, conversationId, newConversation, regenerateMessageId, modelId, kbId, enableThinking, thinkingEffort } = req.body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return errorResponse(res, 'BAD_REQUEST', 'messages 不能为空')
    }

    if (!modelId) {
      return errorResponse(res, 'BAD_REQUEST', 'modelId 不能为空')
    }

    if (!kbId) {
      return errorResponse(res, 'BAD_REQUEST', 'kbId 不能为空')
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

    deps.chatService.chat({
      messages: messages.map(m => ({
        id: m.id ? m.id : String(Date.now()),
        content: m.content,
      })),
      conversationId: convId,
      newConversation,
      regenerateMessageId,
      modelId,
      kbId,
      enableThinking,
      thinkingEffort,
    }).then(() => {
      logger.info('[completions] chat completed')
    }).catch(error => {
      logger.error('[completions] Chat error', { errorMessage: error.message, stack: error.stack })
      deps.sseService.emit({ type: 'error', message: error.message })
    })

    return successResponse(res, { conversationId: convId })
  }
})