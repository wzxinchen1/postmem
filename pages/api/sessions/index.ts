import type { NextApiRequest, NextApiResponse } from 'next'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, apiHandler, successResponse } from '@/src/lib/api-utils'

interface Deps {
  sessionService: SessionService
}

/**
 * 会话列表 API
 * @query {string} kbId - 按知识库筛选
 * @query {string} modelType - 按模型类型筛选
 * @query {string} status - 按状态筛选
 * @query {integer} [page=1] - 页码
 * @query {integer} [limit=20] - 每页数量
 * @response.GET {Session[]} 200 - 会话列表
 */
export default createApiHandler<Deps>({
  dependencies: ['sessionService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const kbId = req.query.kbId as string | undefined
        const modelType = req.query.modelType as string | undefined
        const status = req.query.status as string | undefined
        const page = req.query.page ? Number(req.query.page) : 1
        const limit = req.query.limit ? Number(req.query.limit) : 20

        const result = await deps.sessionService.list({
          kbId,
          modelType,
          status,
          page,
          limit,
        })

        return successResponse(res, result)
      },
    })
  }
})