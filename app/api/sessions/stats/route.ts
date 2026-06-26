import { NextRequest } from 'next/server'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'

interface Deps {
  sessionService: SessionService
}

export const GET = createApiHandler<Deps>({
  dependencies: ['sessionService'],
  handler: async (deps) => {
    const stats = await deps.sessionService.stats()
    return successResponse(stats)
  },
})
