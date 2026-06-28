import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * 删除单个 memory 片段
 * @swagger
 * @response 200 删除成功
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const memoryId = body.memoryId as string | undefined

    if (!memoryId || typeof memoryId !== 'string') {
      return errorResponse('KB_CHUNK_DELETE_MEMORY_ID_REQUIRED')
    }

    await deps.kbService.delete(memoryId)
    return successResponse({ deleted: true })
  },
})
