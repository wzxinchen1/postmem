import type { NextApiRequest, NextApiResponse } from 'next'
import { withMiddleware, successResponse } from '@/src/lib/api-utils'
import { resolve } from '@/src/lib/container'
import { KBService } from '@/src/services/kb.service'
import { SettingService } from '@/src/services/setting.service'
import { Errors } from '@/src/lib/errors'
import type { SearchRequest } from '@/src/types'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body as SearchRequest

  // 验证请求体
  if (!body.kbName || typeof body.kbName !== 'string') {
    throw Errors.badRequest('缺少必需字段: kbName')
  }

  if (!body.query || typeof body.query !== 'string') {
    throw Errors.badRequest('缺少必需字段: query')
  }

  // 从数据库获取默认设置
  const settingService = resolve<SettingService>('settingService')
  const settings = await settingService.getAppSettings()
  
  const topK = body.top_k ?? settings.defaultTopK
  const contextWindow = body.context_window ?? settings.defaultContextWindow

  if (typeof topK !== 'number' || topK < 1 || topK > 100) {
    throw Errors.badRequest('top_k 必须是 1-100 之间的数字')
  }

  if (typeof contextWindow !== 'number' || contextWindow < 0 || contextWindow > 5) {
    throw Errors.badRequest('context_window 必须是 0-5 之间的数字')
  }

  const kbService = resolve<KBService>('kbService')
  const results = await kbService.search(body.kbName, body.query, topK, contextWindow)

  successResponse(res, { results })
}

export default withMiddleware(handler, { methods: ['POST'] })
