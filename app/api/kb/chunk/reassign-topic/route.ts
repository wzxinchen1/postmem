import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  kbService: KBService
}

/**
 * 批量移动片段到指定分类
 * @swagger
 * @response 200 返回移动数量
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const memoryIds = body.memoryIds as string[] | undefined
    const topicId = body.topicId as string | undefined

    if (!memoryIds || !Array.isArray(memoryIds) || memoryIds.length === 0) {
      return errorResponse('KB_CHUNK_REASSIGN_MEMORY_IDS_REQUIRED')
    }

    if (!topicId || typeof topicId !== 'string') {
      return errorResponse('KB_TOPIC_NOT_FOUND_BY_ID')
    }

    const result = await deps.kbService.reassignTopic(memoryIds, topicId)
    return successResponse(result)
  },
})
