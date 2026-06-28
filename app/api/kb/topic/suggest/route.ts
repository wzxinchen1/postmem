import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  kbService: KBService
}

/**
 * AI 辅助生成主题建议
 * @swagger
 * @response 200 返回建议的主题名称和描述
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const kbId = body.kbId as string | undefined
    const content = body.content as string | undefined

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return errorResponse('KB_INGEST_TEXT_CONTENT_REQUIRED')
    }

    const result = await deps.kbService.suggestTopic(kbId, content)
    return successResponse(result)
  },
})
