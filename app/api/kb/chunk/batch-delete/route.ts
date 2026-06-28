import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * 批量删除 memory 片段
 * @swagger
 * @response 200 返回删除数量
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const memoryIds = body.memoryIds as string[] | undefined

    if (!memoryIds || !Array.isArray(memoryIds) || memoryIds.length === 0) {
      return errorResponse('KB_CHUNK_BATCH_DELETE_MEMORY_IDS_REQUIRED')
    }

    const result = await deps.kbService.batchDelete(memoryIds)
    return successResponse(result)
  },
})
