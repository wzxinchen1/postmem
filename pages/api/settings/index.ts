import type { NextApiRequest, NextApiResponse } from 'next'
import { SettingService } from '@/src/services/setting.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  settingService: SettingService
}

/**
 * 应用设置 API
 * @response {AppSettings} 200 - 成功响应
 */
export default createApiHandler<Deps>({
  dependencies: ['settingService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const settings = await deps.settingService.getAppSettings()
        return successResponse(res, { settings })
      },

      PUT: async (deps) => {
        const data = req.body

        if (data.maxContentLength !== undefined && (typeof data.maxContentLength !== 'number' || data.maxContentLength < 1000)) {
          return errorResponse('SETTING_MAX_CONTENT_LENGTH_INVALID', { min: 1000, actual: data.maxContentLength })
        }

        if (data.defaultTopK !== undefined && (typeof data.defaultTopK !== 'number' || data.defaultTopK < 1)) {
          return errorResponse('SETTING_DEFAULT_TOP_K_INVALID', { min: 1, actual: data.defaultTopK })
        }

        if (data.defaultContextWindow !== undefined && (typeof data.defaultContextWindow !== 'number' || data.defaultContextWindow < 0)) {
          return errorResponse('SETTING_DEFAULT_CONTEXT_WINDOW_INVALID', { min: 0, actual: data.defaultContextWindow })
        }

        if (data.defaultPageSize !== undefined && (typeof data.defaultPageSize !== 'number' || data.defaultPageSize < 10)) {
          return errorResponse('SETTING_DEFAULT_PAGE_SIZE_INVALID', { min: 10, actual: data.defaultPageSize })
        }

        const settings = await deps.settingService.updateAppSettings(data)
        return successResponse(res, { settings })
      },
    })
  }
})
