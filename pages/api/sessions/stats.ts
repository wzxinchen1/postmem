import type { NextApiRequest, NextApiResponse } from 'next'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, apiHandler, successResponse } from '@/src/lib/api-utils'

interface Deps {
  sessionService: SessionService
}

export default createApiHandler<Deps>({
  dependencies: ['sessionService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const stats = await deps.sessionService.stats()
        return successResponse(res, stats)
      },
    })
  }
})