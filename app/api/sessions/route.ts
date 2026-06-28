import { NextRequest } from 'next/server'
import { SessionService } from '@/src/services/session.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  sessionService: SessionService
}

/**
 * 查询 LLM 调用会话列表
 * @swagger
 * @response 200 返回分页会话列表
 * @query {string} kbId 知识库 ID
 * @query {string} modelType 模型类型
 * @query {string} status 会话状态
 * @query {string} page 页码
 * @query {string} limit 每页条数
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['sessionService'],
  handler: async (deps, request) => {
    const { searchParams } = request.nextUrl
    const kbId = searchParams.get('kbId') ?? undefined
    const modelType = searchParams.get('modelType') ?? undefined
    const status = searchParams.get('status') ?? undefined
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20

    const result = await deps.sessionService.list({
      kbId,
      modelType,
      status,
      page,
      limit,
    })

    return successResponse(result)
  },
})
