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
    const content = body.content as string | undefined

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('KB_INGEST_TEXT_CONTENT_REQUIRED')
    }

    const result = await deps.kbService.suggestTopic(kbId, content)
    return successResponse(result)
  },
})
