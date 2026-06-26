import { NextRequest } from 'next/server'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'

interface Deps {
  sessionService: SessionService
}

export const GET = createApiHandler<Deps>({
  dependencies: ['sessionService'],
  handler: async (deps, request) => {
    const { searchParams } = request.nextUrl
    const kbId = searchParams.get('kbId') ?? undefined
    const modelType = searchParams.get('modelType') ?? undefined
    const status = searchParams.get('status') ?? undefined
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20

    const result = await deps.sessionService.list({
      kbId,
      modelType,
      status,
      page,
      limit,
    })

    return successResponse(result)
  },
})
