import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { SettingService } from '@/src/services/setting.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { SearchRequest } from '@/src/types'

interface Deps {
  kbService: KBService
  settingService: SettingService
}

export const POST = createApiHandler<Deps>({
  dependencies: ['kbService', 'settingService'],
  handler: async (deps, request) => {
    const body: SearchRequest = await request.json()

    if (!body.kbId || typeof body.kbId !== 'string') {
      return errorResponse('KB_ID_REQUIRED')
    }

    if (!body.query || typeof body.query !== 'string') {
      return errorResponse('KB_QUERY_REQUIRED')
    }

    const settings = await deps.settingService.getAppSettings()

    if (body.top_k === undefined) return errorResponse('KB_TOP_K_REQUIRED')
    if (body.context_window === undefined) return errorResponse('KB_CONTEXT_WINDOW_REQUIRED')

    const topK = body.top_k
    const contextWindow = body.context_window

    if (typeof topK !== 'number' || topK < 1 || topK > 100) {
      return errorResponse('KB_TOP_K_INVALID', { min: 1, max: 100, actual: topK })
    }

    if (typeof contextWindow !== 'number' || contextWindow < 0 || contextWindow > 5) {
      return errorResponse('KB_CONTEXT_WINDOW_INVALID', { min: 0, max: 5, actual: contextWindow })
    }

    const results = await deps.kbService.search(body.kbId, body.query, topK, contextWindow)
    return successResponse({ results })
  },
})
