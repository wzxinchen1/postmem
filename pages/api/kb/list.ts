import type { NextApiRequest, NextApiResponse } from 'next'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
import { KBService } from '@/src/services/kb.service'
import { SettingService } from '@/src/services/setting.service'
import { Errors } from '@/src/lib/errors'
import type { ListRequest } from '@/src/types'

interface Deps {
  kbService: KBService
  settingService: SettingService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['kbService', 'settingService'],
  handler: async (req, res, deps) => {
    const body = req.body as ListRequest

    if (!body.kbId || typeof body.kbId !== 'number') {
      throw Errors.badRequest('缺少必需字段: kbId')
    }

    const page = body.page ?? 1
    const settings = await deps.settingService.getAppSettings()
    const limit = body.limit ?? settings.defaultPageSize

    if (typeof page !== 'number' || page < 1) {
      throw Errors.badRequest('page 必须是大于 0 的数字')
    }

    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      throw Errors.badRequest('limit 必须是 1-100 之间的数字')
    }

    const result = await deps.kbService.list(body.kbId, page, limit)
    successResponse(res, result)
  }
})
