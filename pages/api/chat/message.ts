import type { NextApiRequest, NextApiResponse } from 'next'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import { logger } from '@/src/lib/logger'

interface Deps {
  conversationService: ConversationService
}

export default createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const id = req.query.id as string | undefined

        if (!id) {
          return errorResponse('MISSING_ID')
        }

        const message = await deps.conversationService.getMessage(id)

        if (!message) {
          return errorResponse('MESSAGE_NOT_FOUND')
        }

        logger.info('[ChatMessage] GET /api/chat/message', { messageId: id })

        return successResponse(res, message)
      },
    })
  }
})
