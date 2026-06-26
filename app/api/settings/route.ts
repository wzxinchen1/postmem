import { NextRequest } from 'next/server'
import type { UpdateAppSettingsRequest } from '@/src/types'
import { SettingService } from '@/src/services/setting.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  settingService: SettingService
}

/**
 * 获取应用设置
 * @swagger
 * @response 200 返回当前应用设置
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['settingService'],
  handler: async (deps) => {
    const settings = await deps.settingService.getAppSettings()
    return successResponse({ settings })
  },
})

/**
 * 更新应用设置
 * @swagger
 * @response 200 更新成功
 */
export const PUT = createApiHandler<Deps>({
  dependencies: ['settingService'],
  handler: async (deps, request) => {
    const data: UpdateAppSettingsRequest = await request.json()

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
    return successResponse({ settings })
  },
})
