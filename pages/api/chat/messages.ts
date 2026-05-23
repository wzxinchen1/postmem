import type { NextApiRequest, NextApiResponse } from 'next'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import { logger } from '@/src/lib/logger'

interface Deps {
  conversationService: ConversationService
}

export default createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const conversationId = req.query.conversationId as string | undefined
        const role = req.query.role as string | undefined
        const page = req.query.page ? Number(req.query.page) : 1
        const limit = req.query.limit ? Number(req.query.limit) : 50

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

        return successResponse(res, result)
      },
    })
  }
})