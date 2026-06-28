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
    const name = body.name as string | undefined

    if (!kbId || typeof kbId !== 'string') {
      return errorResponse('KB_ID_REQUIRED')
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('KB_CREATE_NAME_REQUIRED')
    }

    const result = await deps.kbService.createTopic(kbId, name.trim(), (body.description as string)?.trim())
    return successResponse(result)
  },
})
