import type { NextApiRequest, NextApiResponse } from 'next'
import { ChatService } from '@/src/services/chat.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  chatService: ChatService
}

/**
 * 取消聊天 API
 * @response 200 - 成功响应
 */
export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['chatService'],
  handler: async (req, res, deps) => {
    const { conversationId } = req.body

    if (!conversationId) {
      return errorResponse('MISSING_CONVERSATION_ID')
    }

    await deps.chatService.cancelChat(conversationId)
    return successResponse(res, { success: true })
  }
})