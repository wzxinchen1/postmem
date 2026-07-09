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
 * 混合检索知识库（Dense + Sparse + RRF）
 * @swagger
 * @query {string} kbId 知识库 ID
 * @query {string} query 查询文本
 * @query {string} topicIds 分类 ID 列表（逗号分隔）
 * @query {number} top_k 返回结果数量
 * @response 200 返回检索结果列表
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['kbService', 'settingService'],
  handler: async (deps, request) => {
    const params = request.nextUrl.searchParams
    const kbId = params.get('kbId')
    const query = params.get('query')
    const topicIdsStr = params.get('topicIds')
    const topKStr = params.get('top_k')

    if (!kbId || typeof kbId !== 'string') {
      return errorResponse('KB_ID_REQUIRED')
    }

    if (!query || typeof query !== 'string') {
      return errorResponse('KB_QUERY_REQUIRED')
    }

    let topicIds: string[]
    if (topicIdsStr !== null) {
      topicIds = topicIdsStr.split(',').filter(id => id.length > 0)
    } else {
      topicIds = []
    }

    if (!Array.isArray(topicIds) || topicIds.length === 0) {
      return errorResponse('KB_SEARCH_TOPIC_IDS_REQUIRED')
    }

    if (topKStr === null) {
      errorResponse('KB_TOP_K_REQUIRED')
    }

    const topK = Number(topKStr)

    if (typeof topK !== 'number' || topK < 1 || topK > 100) {
      return errorResponse('KB_TOP_K_INVALID', { min: 1, max: 100, actual: topK })
    }

    const results = await deps.kbService.search(kbId, topicIds, query, topK)
    return successResponse({ results })
  },
})
