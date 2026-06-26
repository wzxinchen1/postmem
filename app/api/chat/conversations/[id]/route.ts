import { NextRequest } from 'next/server'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  conversationService: ConversationService
}

/**
 * 获取对话详情
 * @swagger
 * @response 200 返回对话详情
 */
export const GET = createApiHandler<Deps, { id: string }>({
  dependencies: ['conversationService'],
  handler: async (deps, _request, { params }) => {
    const id = params.id

    if (!id) {
      return errorResponse('MISSING_ID')
    }

    const conversation = await deps.conversationService.get(id)
    if (!conversation) {
      return errorResponse('CONVERSATION_NOT_FOUND')
    }

    return successResponse(conversation)
  },
})
