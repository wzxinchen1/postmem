import type { NextApiRequest, NextApiResponse } from 'next'
import { ChatService } from '@/src/services/chat.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  chatService: ChatService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['chatService'],
  handler: async (req, res, deps) => {
    const { conversationId } = req.body

    if (!conversationId) {
      return errorResponse(res, 'BAD_REQUEST', 'conversationId 不能为空')
    }

    await deps.chatService.cancelChat(conversationId)
    return successResponse(res, { success: true })
  }
})