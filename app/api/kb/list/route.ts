import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { SettingService } from '@/src/services/setting.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { ListRequest } from '@/src/types'

interface Deps {
  kbService: KBService
  settingService: SettingService
}

export const POST = createApiHandler<Deps>({
  dependencies: ['kbService', 'settingService'],
  handler: async (deps, request) => {
    const body: ListRequest = await request.json()

    if (!body.kbId || typeof body.kbId !== 'string') {
      return errorResponse('KB_ID_REQUIRED')
    }

    if (body.page === undefined) return errorResponse('KB_PAGE_REQUIRED')
    if (body.limit === undefined) return errorResponse('KB_LIMIT_REQUIRED')

    const page = body.page
    const limit = body.limit

    if (typeof page !== 'number' || page < 1) {
      return errorResponse('KB_PAGE_INVALID')
    }

    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      return errorResponse('KB_LIMIT_INVALID', { min: 1, max: 100, actual: limit })
    }

    const result = await deps.kbService.list(body.kbId, page, limit)
    return successResponse(result)
  },
})
