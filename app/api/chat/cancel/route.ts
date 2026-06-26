import { NextRequest } from 'next/server'
import { ChatService } from '@/src/services/chat.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CancelRequest } from '@/src/types'

interface Deps {
  chatService: ChatService
}

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
