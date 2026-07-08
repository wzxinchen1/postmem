import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * 检测重复片段
 * @swagger
 * @body {string} kbId 知识库 ID
 * @body {number} threshold 相似度阈值 (0-1)
 * @body {number} limit 检测条数上限（默认 100）
 * @response 200 返回重复组列表
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const kbId = body.kbId as string | undefined
    const threshold = body.threshold as number | undefined
    const limit = body.limit as number | undefined

    if (!kbId || typeof kbId !== 'string') {
      return errorResponse('KB_CHUNK_DUPLICATE_DETECT_KB_ID_REQUIRED')
    }

    if (threshold === undefined || threshold === null) {
      return errorResponse('KB_CHUNK_DUPLICATE_DETECT_THRESHOLD_REQUIRED')
    }

    const thresholdNum = Number(threshold)
    if (typeof thresholdNum !== 'number' || thresholdNum < 0 || thresholdNum > 1) {
      return errorResponse('KB_CHUNK_DUPLICATE_DETECT_THRESHOLD_INVALID', { min: 0, max: 1, actual: thresholdNum })
    }

    const detectLimit = typeof limit === 'number' && limit > 0 ? Math.min(limit, 100) : 100

    const result = await deps.kbService.duplicateDetect(kbId, thresholdNum, detectLimit)
    return successResponse(result)
  },
})
