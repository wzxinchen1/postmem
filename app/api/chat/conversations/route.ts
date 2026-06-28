import { NextRequest } from 'next/server'
import type { CreateConversationRequest } from '@/src/types'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  conversationService: ConversationService
}

/**
 * 查询对话列表
 * @swagger
 * @response 200 返回分页对话列表
 * @query {string} kbId 知识库 ID
 * @query {string} page 页码
 * @query {string} limit 每页条数
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (deps, request) => {
    const kbId = request.nextUrl.searchParams.get('kbId') ?? undefined
    const page = request.nextUrl.searchParams.get('page') ? Number(request.nextUrl.searchParams.get('page')) : 1
    const limit = request.nextUrl.searchParams.get('limit') ? Number(request.nextUrl.searchParams.get('limit')) : 20

    const result = await deps.conversationService.list({ page, limit } as any)

    return successResponse(result)
  },
})

/**
 * 创建新对话
 * @swagger
 * @response 200 返回新对话信息
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (deps) => {
    const conversation = await deps.conversationService.create({} as any)
    return successResponse(conversation)
  },
})

/**
 * 删除对话
 * @swagger
 * @response 200 删除成功
 * @query {string} id 对话 ID
 */
export const DELETE = createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (deps, request) => {
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return errorResponse('MISSING_ID')
    }

    await deps.conversationService.delete(id)
    return successResponse({ deleted: true })
  },
})
