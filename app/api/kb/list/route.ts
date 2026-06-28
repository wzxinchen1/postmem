import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { SettingService } from '@/src/services/setting.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
  settingService: SettingService
}

/**
 * 分页查询知识库片段列表
 * @swagger
 * @query {string} kbId 知识库 ID
 * @query {number} page 页码
 * @query {number} limit 每页条数
 * @query {string} topicIds 分类 ID 列表（逗号分隔，可选）
 * @response 200 返回分页片段列表
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['kbService', 'settingService'],
  handler: async (deps, request) => {
    const params = request.nextUrl.searchParams
    const kbId = params.get('kbId')
    const pageStr = params.get('page')
    const limitStr = params.get('limit')
    const topicIdsStr = params.get('topicIds')

    if (!kbId || typeof kbId !== 'string') {
      return errorResponse('KB_ID_REQUIRED')
    }

    if (pageStr === null) {
      errorResponse('KB_PAGE_REQUIRED')
    }
    if (limitStr === null) {
      errorResponse('KB_LIMIT_REQUIRED')
    }

    const page = Number(pageStr)
    const limit = Number(limitStr)

    if (typeof page !== 'number' || page < 1) {
      return errorResponse('KB_PAGE_INVALID')
    }

    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      return errorResponse('KB_LIMIT_INVALID', { min: 1, max: 100, actual: limit })
    }

    let topicIds: string[] | undefined
    if (topicIdsStr !== null) {
      topicIds = topicIdsStr.split(',').filter(id => id.length > 0)
    }
    const result = await deps.kbService.list(kbId, page, limit, topicIds)
    return successResponse(result)
  },
})
