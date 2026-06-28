import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { AppError } from '@/src/lib/errors'
import { withErrorHandler } from '@/src/lib/with-error-handler'
import { successResponse, errorResponse } from '@/src/lib/api-utils'
import container from '@/src/lib/container'
import type { IngestTextRequest, IngestMessagesRequest } from '@/src/types'

export const dynamic = 'force-dynamic'

/**
 * 知识入库（文本或消息列表）
 * @swagger
 * @sse 文本入库模式返回 SSE 流式进度
 * @response 200 入库完成（文本模式返回 SSE 流）
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
    return handleTextIngestStream(body as IngestTextRequest, kbService, request)
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

async function handleTextIngestStream(body: IngestTextRequest, kbService: KBService, request: NextRequest): Promise<Response> {
  if (!body.content || typeof body.content !== 'string') {
    return errorResponse('KB_CONTENT_REQUIRED')
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const sendEvent = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // stream可能已关闭
        }
      }

      kbService.ingestTextStream(body.kbId, body.content, sendEvent)
        .then(result => {
          sendEvent({ type: 'complete', data: result })
          try { controller.close() } catch {}
        })
        .catch((error: unknown) => {
          const errorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR'
          const errorMessage = error instanceof Error ? error.message : '入库失败'
          sendEvent({
            type: 'error',
            data: { message: errorMessage, code: errorCode },
          })
          try { controller.close() } catch {}
        })
    },
    cancel() {
      // 客户端断开连接时清理
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
