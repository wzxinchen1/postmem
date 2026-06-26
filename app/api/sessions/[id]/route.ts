import { NextRequest } from 'next/server'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  sessionService: SessionService
}

/**
 * 获取指定 LLM 调用会话详情
 * @swagger
 * @response 200 返回会话详情
 */
export const GET = createApiHandler<Deps, { id: string }>({
  dependencies: ['sessionService'],
  handler: async (deps, _request, { params }) => {
    const id = params.id

    if (!id) {
      return errorResponse('INVALID_SESSION_ID')
    }

    const session = await deps.sessionService.get(id)

    if (!session) {
      return errorResponse('SESSION_NOT_FOUND')
    }

    return successResponse({ session })
  },
})

/**
 * 删除指定 LLM 调用会话
 * @swagger
 * @response 200 删除成功
 */
export const DELETE = createApiHandler<Deps, { id: string }>({
  dependencies: ['sessionService'],
  handler: async (deps, _request, { params }) => {
    const id = params.id

    if (!id) {
      return errorResponse('INVALID_SESSION_ID')
    }

    const session = await deps.sessionService.get(id)

    if (!session) {
      return errorResponse('SESSION_NOT_FOUND')
    }

    await deps.sessionService.delete(id)
    return successResponse({ message: '删除成功' })
  },
})
