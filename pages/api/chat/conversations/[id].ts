import type { NextApiRequest, NextApiResponse } from 'next'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  conversationService: ConversationService
}

export default createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (req, res, deps) => {
    const id = req.query.id as string
    if (!id) {
      return errorResponse('MISSING_ID')
    }

    if (req.method === 'GET') {
      const conversation = await deps.conversationService.get(id)
      if (!conversation) {
        return errorResponse('CONVERSATION_NOT_FOUND')
      }
      return successResponse(res, conversation)
    }

    return errorResponse('METHOD_NOT_ALLOWED')
  }
})