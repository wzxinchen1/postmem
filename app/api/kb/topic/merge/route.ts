import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * 合并分类
 * @swagger
 * @response 200 返回移动和删除的数量
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const sourceTopicIds = body.sourceTopicIds as string[] | undefined
    const targetTopicId = body.targetTopicId as string | undefined

    if (!sourceTopicIds || !Array.isArray(sourceTopicIds) || sourceTopicIds.length === 0) {
      return errorResponse('KB_TOPIC_MERGE_SOURCE_IDS_REQUIRED')
    }

    if (!targetTopicId || typeof targetTopicId !== 'string') {
      return errorResponse('KB_TOPIC_NOT_FOUND_BY_ID')
    }

    const result = await deps.kbService.mergeTopics(sourceTopicIds, targetTopicId)
    return successResponse(result)
  },
})
