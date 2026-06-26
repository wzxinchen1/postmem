import { NextRequest } from 'next/server'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import { logger } from '@/src/lib/logger'

interface Deps {
  conversationService: ConversationService
}

export const GET = createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (deps, request) => {
    const id = request.nextUrl.searchParams.get('id') ?? undefined

    if (!id) {
      return errorResponse('MISSING_ID')
    }

    const message = await deps.conversationService.getMessage(id)

    if (!message) {
      return errorResponse('MESSAGE_NOT_FOUND')
    }

    logger.info('[ChatMessage] GET /api/chat/message', { messageId: id })

    return successResponse(message)
  },
})
