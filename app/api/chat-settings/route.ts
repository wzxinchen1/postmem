import { NextRequest } from 'next/server'
import type { UpdateChatSettingRequest } from '@/src/types'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  chatSettingService: ChatSettingService
}

/**
 * 获取聊天设置
 * @swagger
 * @response 200 返回聊天设置
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['chatSettingService'],
  handler: async (deps) => {
    const setting = await deps.chatSettingService.get()
    return successResponse({ setting })
  },
})

/**
 * 更新聊天设置
 * @swagger
 * @response 200 更新成功，返回聊天设置
 */
export const PUT = createApiHandler<Deps>({
  dependencies: ['chatSettingService'],
  handler: async (deps, request) => {
    const data: UpdateChatSettingRequest = await request.json()

    if (data.memoryContextThreshold !== undefined) {
      if (typeof data.memoryContextThreshold !== 'number') {
        return errorResponse('CHAT_SETTING_MEMORY_CONTEXT_THRESHOLD_TYPE')
      }
      if (data.memoryContextThreshold < 1 || data.memoryContextThreshold > 1000) {
        return errorResponse('CHAT_SETTING_MEMORY_CONTEXT_THRESHOLD_RANGE', { min: 1, max: 1000, actual: data.memoryContextThreshold })
      }
    }

    if (data.maxOutputTokens !== undefined && data.maxOutputTokens !== null) {
      if (typeof data.maxOutputTokens !== 'number') {
        return errorResponse('CHAT_SETTING_MAX_OUTPUT_TOKENS_TYPE')
      }
      if (data.maxOutputTokens < 1 || data.maxOutputTokens > 100000) {
        return errorResponse('CHAT_SETTING_MAX_OUTPUT_TOKENS_RANGE', { min: 1, max: 100000, actual: data.maxOutputTokens })
      }
    }

    if (data.searchLinkCount !== undefined) {
      if (typeof data.searchLinkCount !== 'number') {
        return errorResponse('CHAT_SETTING_SEARCH_LINK_COUNT_TYPE')
      }
      if (data.searchLinkCount < 1 || data.searchLinkCount > 50) {
        return errorResponse('CHAT_SETTING_SEARCH_LINK_COUNT_RANGE', { min: 1, max: 50, actual: data.searchLinkCount })
      }
    }

    if (data.searchSummaryConcurrency !== undefined) {
      if (typeof data.searchSummaryConcurrency !== 'number') {
        return errorResponse('CHAT_SETTING_SEARCH_SUMMARY_CONCURRENCY_TYPE')
      }
      if (data.searchSummaryConcurrency < 1 || data.searchSummaryConcurrency > 10) {
        return errorResponse('CHAT_SETTING_SEARCH_SUMMARY_CONCURRENCY_RANGE', { min: 1, max: 10, actual: data.searchSummaryConcurrency })
      }
    }

    if (data.chunkCharRange !== undefined) {
      if (typeof data.chunkCharRange !== 'string') {
        return errorResponse('CHAT_SETTING_CHUNK_CHAR_RANGE_TYPE')
      }
      if (!/^\d+-\d+$/.test(data.chunkCharRange)) {
        return errorResponse('CHAT_SETTING_CHUNK_CHAR_RANGE_FORMAT')
      }
      const [min, max] = data.chunkCharRange.split('-').map(Number)
      if (min < 50 || max > 5000 || min >= max) {
        return errorResponse('CHAT_SETTING_CHUNK_CHAR_RANGE_INVALID', { minLimit: 50, maxLimit: 5000, actual: data.chunkCharRange })
      }
    }

    if (data.userProfile !== undefined && data.userProfile !== null) {
      if (typeof data.userProfile !== 'string') {
        return errorResponse('CHAT_SETTING_USER_PROFILE_TYPE')
      }
      if (data.userProfile.length > 2000) {
        return errorResponse('CHAT_SETTING_USER_PROFILE_TOO_LONG', { max: 2000, actual: data.userProfile.length })
      }
    }

    const setting = await deps.chatSettingService.update(data)
    return successResponse({ setting })
  },
})
