import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { withErrorHandler } from '@/src/lib/with-error-handler'
import { successResponse, errorResponse } from '@/src/lib/api-utils'
import container from '@/src/lib/container'
import type { IngestTextRequest, IngestMessagesRequest } from '@/src/types'

export const dynamic = 'force-dynamic'

/**
 * 知识入库（文本或消息列表）
 * @swagger
 * @response 200 入库完成
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const scope = container.createScope()
  const kbService = scope.resolve<KBService>('kbService')
  const body: IngestTextRequest | IngestMessagesRequest = await request.json()

  if (!body.kbId || typeof body.kbId !== 'string') {
    return errorResponse('KB_ID_REQUIRED')
  }

  if ('messages' in body && Array.isArray((body as IngestMessagesRequest).messages)) {
    return handleMessagesIngest(body as IngestMessagesRequest, kbService)
  } else if ('content' in body && typeof (body as IngestTextRequest).content === 'string') {
    return handleTextIngest(body as IngestTextRequest, kbService)
  } else {
    return errorResponse('KB_CONTENT_OR_MESSAGES_REQUIRED')
  }
})

async function handleMessagesIngest(body: IngestMessagesRequest, kbService: KBService): Promise<Response> {
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return errorResponse('KB_MESSAGES_REQUIRED')
  }

  for (const msg of body.messages) {
    if (!msg.id || typeof msg.id !== 'string') {
      return errorResponse('KB_MESSAGE_ID_REQUIRED')
    }
    if (!msg.role || typeof msg.role !== 'string') {
      return errorResponse('KB_MESSAGE_ROLE_REQUIRED')
    }
    if (!msg.content || typeof msg.content !== 'string') {
      return errorResponse('KB_MESSAGE_CONTENT_REQUIRED')
    }
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      return errorResponse('KB_MESSAGE_INVALID_ROLE')
    }
  }

  const result = await kbService.ingestMessages(body.kbId, body.messages, '', true)
  return successResponse(result)
}

async function handleTextIngest(body: IngestTextRequest, kbService: KBService): Promise<Response> {
  if (!body.content || typeof body.content !== 'string') {
    return errorResponse('KB_CONTENT_REQUIRED')
  }

  const result = await kbService.ingestText(body.kbId, body.content)
  return successResponse(result)
}
