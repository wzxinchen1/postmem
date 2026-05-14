import type { NextApiRequest, NextApiResponse } from 'next'
import { withMiddleware, successResponse } from '@/src/lib/api-utils'
import { resolve } from '@/src/lib/container'
import { KBService } from '@/src/services/kb.service'
import { SettingService } from '@/src/services/setting.service'
import { Errors } from '@/src/lib/errors'
import type { ListRequest } from '@/src/types'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body as ListRequest

  // 验证请求体
  if (!body.kbName || typeof body.kbName !== 'string') {
    throw Errors.badRequest('缺少必需字段: kbName')
  }

  const page = body.page ?? 1
  
  // 从数据库获取默认设置
  const settingService = resolve<SettingService>('settingService')
  const settings = await settingService.getAppSettings()
  const limit = body.limit ?? settings.defaultPageSize

  if (typeof page !== 'number' || page < 1) {
    throw Errors.badRequest('page 必须是大于 0 的数字')
  }

  if (typeof limit !== 'number' || limit < 1 || limit > 100) {
    throw Errors.badRequest('limit 必须是 1-100 之间的数字')
  }

  const kbService = resolve<KBService>('kbService')
  const result = await kbService.list(body.kbName, page, limit)

  successResponse(res, result)
}

export default withMiddleware(handler, { methods: ['POST'] })
