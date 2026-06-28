import { NextRequest } from 'next/server'
import { ChatService } from '@/src/services/chat.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CancelRequest } from '@/src/types'

export const dynamic = 'force-dynamic'

interface Deps {
  chatService: ChatService
}

/**
 * 取消正在进行的聊天
 * @swagger
 * @response 200 取消成功
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['chatService'],
  handler: async (deps, request) => {
    const { conversationId }: CancelRequest = await request.json()

    if (!conversationId) {
      return errorResponse('MISSING_CONVERSATION_ID')
    }

    await deps.chatService.cancelChat(conversationId)
    return successResponse({ success: true })
  },
})
