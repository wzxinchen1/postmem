import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * 重命名分类
 * @swagger
 * @response 200 操作成功
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const topicId = body.topicId as string | undefined
    const name = body.name as string | undefined
    const description = body.description as string | undefined

    if (!topicId || typeof topicId !== 'string') {
      return errorResponse('KB_TOPIC_NOT_FOUND_BY_ID')
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('KB_CREATE_NAME_REQUIRED')
    }

    await deps.kbService.renameTopic(topicId, name, description)
    return successResponse({ success: true })
  },
})
