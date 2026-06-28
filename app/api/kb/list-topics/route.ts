import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * 获取主题列表
 * @swagger
 * @query {string} kbId 知识库 ID
 * @response 200 返回主题列表
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request, { params }) => {
    const kbId = request.nextUrl.searchParams.get('kbId')

    if (!kbId || typeof kbId !== 'string') {
      return errorResponse('KB_ID_REQUIRED')
    }

    const items = await deps.kbService.listTopics(kbId)
    return successResponse(items)
  },
})
