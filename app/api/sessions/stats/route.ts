import { NextRequest } from 'next/server'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  sessionService: SessionService
}

/**
 * 获取 LLM 调用会话统计
 * @swagger
 * @response 200 返回统计结果
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['sessionService'],
  handler: async (deps) => {
    const stats = await deps.sessionService.stats()
    return successResponse(stats)
  },
})
