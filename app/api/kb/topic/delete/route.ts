import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  kbService: KBService
}

/**
 * 删除主题（仅允许空主题）
 * @swagger
 * @response 200 删除成功
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const topicId = body.topicId as string | undefined

    if (!topicId || typeof topicId !== 'string') {
      return errorResponse('KB_TOPIC_NOT_FOUND_BY_ID')
    }

    await deps.kbService.deleteTopic(topicId)
    return successResponse({ success: true })
  },
})
