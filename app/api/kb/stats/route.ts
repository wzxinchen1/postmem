import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
import type { StatsRequest } from '@/src/types'

interface Deps {
  kbService: KBService
}

export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body: StatsRequest = await request.json()
    const result = await deps.kbService.stats(body.kbId)
    return successResponse(result)
  },
})
