import { NextRequest } from 'next/server'
import { SSEService } from '@/src/services/sse.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
import type { CleanupRequest } from '@/src/types'

interface Deps {
  sseService: SSEService
}

export const POST = createApiHandler<Deps>({
  dependencies: ['sseService'],
  handler: async (deps, request) => {
    const body: CleanupRequest = await request.json()
    const { conversationId } = body ?? {}

    await deps.sseService.clearMessageStream(conversationId)

    if (conversationId) {
      await deps.sseService.clearCancelled(conversationId)
    }

    return successResponse({ success: true })
  },
})
