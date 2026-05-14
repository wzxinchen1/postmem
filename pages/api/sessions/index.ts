import type { NextApiRequest, NextApiResponse } from 'next'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, apiHandler, successResponse } from '@/src/lib/api-utils'

interface Deps {
  sessionService: SessionService
}

/**
 * 会话列表 API
 */
export default createApiHandler<Deps>({
  dependencies: ['sessionService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const kbName = req.query.kbName as string | undefined
        const modelType = req.query.modelType as string | undefined
        const status = req.query.status as string | undefined
        const page = req.query.page ? Number(req.query.page) : 1
        const limit = req.query.limit ? Number(req.query.limit) : 20

        const result = await deps.sessionService.list({
          kbName,
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