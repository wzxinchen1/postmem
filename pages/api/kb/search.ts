import type { NextApiRequest, NextApiResponse } from 'next'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
import { KBService } from '@/src/services/kb.service'
import { SettingService } from '@/src/services/setting.service'
import { Errors } from '@/src/lib/errors'
import type { SearchRequest } from '@/src/types'

interface Deps {
  kbService: KBService
  settingService: SettingService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['kbService', 'settingService'],
  handler: async (req, res, deps) => {
    const body = req.body as SearchRequest

    if (!body.kbId || typeof body.kbId !== 'number') {
      throw Errors.badRequest('缺少必需字段: kbId')
    }

    if (!body.query || typeof body.query !== 'string') {
      throw Errors.badRequest('缺少必需字段: query')
    }

    const settings = await deps.settingService.getAppSettings()
    const topK = body.top_k ?? settings.defaultTopK
    const contextWindow = body.context_window ?? settings.defaultContextWindow

    if (typeof topK !== 'number' || topK < 1 || topK > 100) {
      throw Errors.badRequest('top_k 必须是 1-100 之间的数字')
    }

    if (typeof contextWindow !== 'number' || contextWindow < 0 || contextWindow > 5) {
      throw Errors.badRequest('context_window 必须是 0-5 之间的数字')
    }

    const results = await deps.kbService.search(body.kbId, body.query, topK, contextWindow)
    successResponse(res, { results })
  }
})
