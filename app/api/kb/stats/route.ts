import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
interface Deps {
  kbService: KBService
}

/**
 * 获取知识库统计
 * @swagger
 * @query {string} kbId 知识库 ID（可选，不传返回全部统计）
 * @response 200 返回统计信息
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const kbIdParam = request.nextUrl.searchParams.get('kbId')
    let kbId: string | undefined
    if (kbIdParam !== null) {
      kbId = kbIdParam
    }
    const result = await deps.kbService.stats(kbId)
    return successResponse(result)
  },
})
