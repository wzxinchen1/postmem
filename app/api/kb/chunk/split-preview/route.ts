import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  kbService: KBService
}

/**
 * AI 拆分预览
 * @swagger
 * @response 200 返回 AI 拆分的片段列表及主题建议
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const memoryId = body.memoryId

    if (!memoryId || typeof memoryId !== 'string') {
      return errorResponse('KB_CHUNK_SPLIT_MEMORY_ID_REQUIRED')
    }

    const result = await deps.kbService.splitPreview(memoryId)
    return successResponse(result)
  },
})
