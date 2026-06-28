import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * AI 合并预览
 * @swagger
 * @response 200 返回 AI 合并建议的标题和内容
 */
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
