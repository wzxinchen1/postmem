import type { NextApiRequest, NextApiResponse } from 'next'
import { resolve } from '@/src/lib/container'
import { SettingService } from '@/src/services/setting.service'
import { apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

/**
 * 应用设置 API
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const settingService = resolve<SettingService>('settingService')

  await apiHandler(req, res, {
    GET: async () => {
      const settings = await settingService.getAppSettings()
      return successResponse(res, { settings })
    },

    PUT: async () => {
      const data = req.body

      // 验证设置值
      if (data.maxContentLength !== undefined && (typeof data.maxContentLength !== 'number' || data.maxContentLength < 1000)) {
        return errorResponse(res, 'VALIDATION_ERROR', 'maxContentLength 必须大于等于 1000', 400)
      }

      if (data.defaultTopK !== undefined && (typeof data.defaultTopK !== 'number' || data.defaultTopK < 1)) {
        return errorResponse(res, 'VALIDATION_ERROR', 'defaultTopK 必须大于等于 1', 400)
      }

      if (data.defaultContextWindow !== undefined && (typeof data.defaultContextWindow !== 'number' || data.defaultContextWindow < 0)) {
        return errorResponse(res, 'VALIDATION_ERROR', 'defaultContextWindow 必须大于等于 0', 400)
      }

      if (data.defaultPageSize !== undefined && (typeof data.defaultPageSize !== 'number' || data.defaultPageSize < 10)) {
        return errorResponse(res, 'VALIDATION_ERROR', 'defaultPageSize 必须大于等于 10', 400)
      }

      const settings = await settingService.updateAppSettings(data)
      return successResponse(res, { settings })
    },
  })
}
