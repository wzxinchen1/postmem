import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * 创建主题
 * @swagger
 * @response 200 返回新创建的主题信息
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const kbId = body.kbId as string | undefined
    const name = body.name as string | undefined

    if (!kbId || typeof kbId !== 'string') {
      return errorResponse('KB_ID_REQUIRED')
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return errorResponse('KB_CREATE_NAME_REQUIRED')
    }

    const description = body.description as string | undefined
    if (description === undefined || typeof description !== 'string' || description.trim().length === 0) {
      return errorResponse('KB_CREATE_DESCRIPTION_REQUIRED')
    }

    const result = await deps.kbService.createTopic(kbId, name.trim(), description.trim())
    return successResponse(result)
  },
})
