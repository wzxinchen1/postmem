import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  kbService: KBService
}

/**
 * 查询超长片段
 * @swagger
 * @response 200 查询成功
 * /api/kb/long-chunks:
 *   post:
 *     tags: [Knowledge Base]
 *     summary: 查询超长片段
 *     description: 查询 content 字符数超过指定阈值的 memory 片段，支持按知识库过滤和分页
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               threshold:
 *                 type: integer
 *                 description: 字符数阈值
 *                 example: 1000
 *               kbId:
 *                 type: string
 *                 description: 知识库 ID（可选，不传查全部）
 *                 example: "clx..."
 *               page:
 *                 type: integer
 *                 description: 页码
 *                 example: 1
 *               limit:
 *                 type: integer
 *                 description: 每页条数
 *                 example: 20
 *     responses:
 *       200:
 *         description: 查询成功
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()

    const threshold = body.threshold
    const page = body.page
    const limit = body.limit

    if (threshold === undefined) return errorResponse('KB_LONG_CHUNKS_THRESHOLD_REQUIRED')
    if (typeof threshold !== 'number' || threshold < 1) {
      return errorResponse('KB_LONG_CHUNKS_THRESHOLD_INVALID', { min: 1, actual: threshold })
    }
    if (page === undefined) return errorResponse('KB_LONG_CHUNKS_PAGE_REQUIRED')
    if (limit === undefined) return errorResponse('KB_LONG_CHUNKS_LIMIT_REQUIRED')
    if (typeof page !== 'number' || page < 1) {
      return errorResponse('KB_LONG_CHUNKS_PAGE_INVALID')
    }
    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      return errorResponse('KB_LONG_CHUNKS_LIMIT_INVALID', { min: 1, max: 100, actual: limit })
    }

    const fetchPage = page
    const fetchLimit = limit

    const result = await deps.kbService.findLongChunks({
      threshold,
      page: fetchPage,
      limit: fetchLimit,
      kbId: body.kbId || undefined,
    })

    return successResponse(result)
  },
})
