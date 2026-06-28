import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  kbService: KBService
}

/**
 * 确认合并
 * @swagger
 * @response 200 返回合并后的新片段 ID
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const memoryIds = body.memoryIds as string[] | undefined
    const merged = body.merged as { title?: string; content?: string; topicId?: string | null } | undefined

    if (!memoryIds || !Array.isArray(memoryIds) || memoryIds.length === 0) {
      return errorResponse('KB_CHUNK_MERGE_MEMORY_IDS_REQUIRED')
    }

    if (memoryIds.length < 2) {
      return errorResponse('KB_CHUNK_MERGE_MEMORY_IDS_TOO_FEW')
    }

    if (!merged || !merged.title || !merged.content) {
      return errorResponse('KB_CHUNK_MERGE_FIELDS_REQUIRED')
    }

    const result = await deps.kbService.mergeConfirm(memoryIds, {
      title: merged.title,
      content: merged.content,
      topicId: merged.topicId ?? null,
    })
    return successResponse(result)
  },
})
