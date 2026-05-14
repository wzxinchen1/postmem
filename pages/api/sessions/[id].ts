import type { NextApiRequest, NextApiResponse } from 'next'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  sessionService: SessionService
}

/**
 * 会话详情和删除 API
 */
export default createApiHandler<Deps>({
  dependencies: ['sessionService'],
  handler: async (req, res, deps) => {
    const id = Number(req.query.id)

    if (isNaN(id)) {
      return errorResponse(res, 'VALIDATION_ERROR', '无效的会话 ID', 400)
    }

    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const session = await deps.sessionService.get(id)

        if (!session) {
          return errorResponse(res, 'NOT_FOUND', '会话不存在', 404)
        }

        return successResponse(res, { session })
      },

      DELETE: async (deps) => {
        const session = await deps.sessionService.get(id)

        if (!session) {
          return errorResponse(res, 'NOT_FOUND', '会话不存在', 404)
        }

        await deps.sessionService.delete(id)
        return successResponse(res, { message: '删除成功' })
      },
    })
  }
})
