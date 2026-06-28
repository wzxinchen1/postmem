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
    const memoryIds = body.memoryIds as string[] | undefined

    if (!memoryIds || !Array.isArray(memoryIds) || memoryIds.length === 0) {
      return errorResponse('KB_CHUNK_MERGE_MEMORY_IDS_REQUIRED')
    }

    if (memoryIds.length < 2) {
      return errorResponse('KB_CHUNK_MERGE_MEMORY_IDS_TOO_FEW')
    }

    const result = await deps.kbService.mergePreview(memoryIds)
    return successResponse(result)
  },
})
