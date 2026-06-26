import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { DeleteRequest } from '@/src/types'

interface Deps {
  kbService: KBService
}

/**
 * 删除指定 memory 片段
 * @swagger
 * @response 200 删除成功
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body: DeleteRequest = await request.json()

    if (!body.id || typeof body.id !== 'string') {
      return errorResponse('MISSING_ID')
    }

    await deps.kbService.delete(body.id)
    return successResponse({ deleted: true, id: body.id })
  },
})
