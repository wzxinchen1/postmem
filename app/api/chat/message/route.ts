import { NextRequest } from 'next/server'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import { logger } from '@/src/lib/logger'

export const dynamic = 'force-dynamic'

interface Deps {
  conversationService: ConversationService
}

/**
 * 获取单条聊天消息
 * @swagger
 * @response 200 返回消息内容
 * @query {string} id 消息 ID
 */
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
