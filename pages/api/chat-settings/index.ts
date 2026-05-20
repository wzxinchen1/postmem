import type { NextApiRequest, NextApiResponse } from 'next'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  chatSettingService: ChatSettingService
}

/**
 * 聊天设置 API - 管理 chat_settings 表
 */
export default createApiHandler<Deps>({
  dependencies: ['chatSettingService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const setting = await deps.chatSettingService.get()
        return successResponse(res, { setting })
      },

      PUT: async (deps) => {
        const data = req.body

        if (data.memoryContextThreshold !== undefined) {
          if (typeof data.memoryContextThreshold !== 'number') {
            return errorResponse(res, 'VALIDATION_ERROR', 'memoryContextThreshold 必须是数字', 400)
          }
          if (data.memoryContextThreshold < 1 || data.memoryContextThreshold > 1000) {
            return errorResponse(res, 'VALIDATION_ERROR', 'memoryContextThreshold 必须在 1-1000 之间', 400)
          }
        }

        if (data.maxOutputTokens !== undefined && data.maxOutputTokens !== null) {
          if (typeof data.maxOutputTokens !== 'number') {
            return errorResponse(res, 'VALIDATION_ERROR', 'maxOutputTokens 必须是数字或 null', 400)
          }
          if (data.maxOutputTokens < 1 || data.maxOutputTokens > 100000) {
            return errorResponse(res, 'VALIDATION_ERROR', 'maxOutputTokens 必须在 1-100000 之间，设为 null 表示不限制', 400)
          }
        }

        if (data.searchLinkCount !== undefined) {
          if (typeof data.searchLinkCount !== 'number') {
            return errorResponse(res, 'VALIDATION_ERROR', 'searchLinkCount 必须是数字', 400)
          }
          if (data.searchLinkCount < 1 || data.searchLinkCount > 50) {
            return errorResponse(res, 'VALIDATION_ERROR', 'searchLinkCount 必须在 1-50 之间', 400)
          }
        }

        const setting = await deps.chatSettingService.update(data)
        return successResponse(res, { setting })
      },
    })
  }
})
