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
      return errorResponse(res, 'BAD_REQUEST', 'id 不能为空')
    }

    if (req.method === 'GET') {
      const conversation = await deps.conversationService.get(id)
      if (!conversation) {
        return errorResponse(res, 'BAD_REQUEST', `对话 ${id} 不存在`)
      }
      return successResponse(res, conversation)
    }

    return res.status(405).send('方法不被允许')
  }
})