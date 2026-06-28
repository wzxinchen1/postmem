import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  kbService: KBService
}

export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const kbId = body.kbId as string | undefined

    if (!kbId || typeof kbId !== 'string') {
      return errorResponse('KB_ID_REQUIRED')
    }

    const items = await deps.kbService.listTopics(kbId)
    return successResponse({ items })
  },
})
