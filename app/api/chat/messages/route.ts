import { NextRequest } from 'next/server'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import { logger } from '@/src/lib/logger'

interface Deps {
  conversationService: ConversationService
}

/**
 * 查询聊天消息列表
 * @swagger
 * @response 200 返回分页消息列表
 * @query {string} conversationId 对话 ID
 * @query {string} role 消息角色过滤
 * @query {string} page 页码
 * @query {string} limit 每页条数
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (deps, request) => {
    const conversationId = request.nextUrl.searchParams.get('conversationId') ?? undefined
    const role = request.nextUrl.searchParams.get('role') ?? undefined
    const page = request.nextUrl.searchParams.get('page') ? Number(request.nextUrl.searchParams.get('page')) : 1
    const limit = request.nextUrl.searchParams.get('limit') ? Number(request.nextUrl.searchParams.get('limit')) : 50

    logger.info('[ChatMessages] GET /api/chat/messages', { conversationId, role, page, limit })

    if (role && !['user', 'assistant', 'system'].includes(role)) {
      logger.warn('[ChatMessages] 无效的 role 参数', { role })
      return errorResponse('INVALID_ROLE')
    }

    const result = await deps.conversationService.listMessages({
      conversationId,
      role,
      page,
      limit,
    })

    logger.info('[ChatMessages] 返回消息列表', { conversationId: result.conversationId, total: result.total, page: result.page, limit: result.limit })

    return successResponse(result)
  },
})
