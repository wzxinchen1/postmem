import { NextRequest } from 'next/server'
import type { CreateConversationRequest } from '@/src/types'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  conversationService: ConversationService
}

export const GET = createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (deps, request) => {
    const kbId = request.nextUrl.searchParams.get('kbId') ?? undefined
    const page = request.nextUrl.searchParams.get('page') ? Number(request.nextUrl.searchParams.get('page')) : 1
    const limit = request.nextUrl.searchParams.get('limit') ? Number(request.nextUrl.searchParams.get('limit')) : 20

    const result = await deps.conversationService.list({ page, limit } as any)

    return successResponse(result)
  },
})

export const POST = createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (deps) => {
    const conversation = await deps.conversationService.create({} as any)
    return successResponse(conversation)
  },
})

export const DELETE = createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (deps, request) => {
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return errorResponse('MISSING_ID')
    }

    await deps.conversationService.delete(id)
    return successResponse({ deleted: true })
  },
})
