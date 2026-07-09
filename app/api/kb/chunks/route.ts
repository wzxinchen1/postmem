import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * 查询超长片段
 * @swagger
 * @query {number} threshold 字符数阈值
 * @query {number} page 页码
 * @query {number} limit 每页条数
 * @query {string} kbId 知识库 ID（可选）
 * @query {string} topicIds 分类 ID 列表（逗号分隔，可选）
 * @response 200 查询成功
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const params = request.nextUrl.searchParams
    const thresholdStr = params.get('threshold')
    const pageStr = params.get('page')
    const limitStr = params.get('limit')
    const kbId = params.get('kbId')
    const topicIdsStr = params.get('topicIds')

    if (thresholdStr === null) {
      errorResponse('KB_LONG_CHUNKS_THRESHOLD_REQUIRED')
    }
    const threshold = Number(thresholdStr)
    if (typeof threshold !== 'number' || threshold < 1) {
      return errorResponse('KB_LONG_CHUNKS_THRESHOLD_INVALID', { min: 1, actual: threshold })
    }
    if (pageStr === null) {
      errorResponse('KB_LONG_CHUNKS_PAGE_REQUIRED')
    }
    if (limitStr === null) {
      errorResponse('KB_LONG_CHUNKS_LIMIT_REQUIRED')
    }
    const page = Number(pageStr)
    const limit = Number(limitStr)
    if (typeof page !== 'number' || page < 1) {
      return errorResponse('KB_LONG_CHUNKS_PAGE_INVALID')
    }
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      return errorResponse('KB_LONG_CHUNKS_LIMIT_INVALID', { min: 1, max: 100, actual: limit })
    }

    let topicIds: string[] | undefined
    if (topicIdsStr !== null) {
      topicIds = topicIdsStr.split(',').filter(id => id.length > 0)
    }

    const findParams: Record<string, unknown> = { threshold, page, limit }
    if (kbId !== null) {
      findParams.kbId = kbId
    }
    if (topicIds !== undefined) {
      findParams.topicIds = topicIds
    }

    const result = await deps.kbService.findChunks(findParams as any)

    return successResponse(result)
  },
})
