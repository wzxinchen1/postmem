import type { NextApiRequest, NextApiResponse } from 'next'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  sessionService: SessionService
}

export default createApiHandler<Deps>({
  dependencies: ['sessionService'],
  handler: async (req, res, deps) => {
    const id = req.query.id as string

    if (!id) {
      return errorResponse('INVALID_SESSION_ID')
    }

    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const session = await deps.sessionService.get(id)

        if (!session) {
          return errorResponse('SESSION_NOT_FOUND')
        }

        return successResponse(res, { session })
      },

      DELETE: async (deps) => {
        const session = await deps.sessionService.get(id)

        if (!session) {
          return errorResponse('SESSION_NOT_FOUND')
        }

        await deps.sessionService.delete(id)
        return successResponse(res, { message: '删除成功' })
      },
    })
  }
})