import type { NextApiRequest, NextApiResponse } from 'next'
import { KBService } from '@/src/services/kb.service'
import { AppError } from '@/src/lib/errors'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { IngestTextRequest, IngestMessagesRequest } from '@/src/types'

interface Deps {
  kbService: KBService
}

/**
 * 文本入库 API
 * @sse - 文本入库 SSE 流式响应，实时推送处理进度
 * @sse-event {message: string} status - 状态更新通知
 * @sse-event {object} progress - 处理进度更新
 * @sse-event {object} chunk_detail - 片段处理详情
 * @sse-event {IngestTextResponse} complete - 处理完成
 * @sse-event {message: string, code: string} error - 处理出错
 * @response {IngestTextResponse} 200 - 成功响应
 */
export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['kbService'],
  handler: async (req, res, deps) => {
    const body = req.body

    if (!body.kbId || typeof body.kbId !== 'string') {
      return errorResponse('KB_ID_REQUIRED')
    }

    if (body.messages && Array.isArray(body.messages)) {
      return await handleMessagesIngest(req, res, deps)
    } else if (body.content && typeof body.content === 'string') {
      return await handleTextIngestStream(req, res, deps)
    } else {
      return errorResponse('KB_CONTENT_OR_MESSAGES_REQUIRED')
    }
  }
})

async function handleTextIngestStream(req: NextApiRequest, res: NextApiResponse, deps: Deps) {
  const body = req.body as IngestTextRequest

  if (!body.content || typeof body.content !== 'string') {
    return errorResponse('KB_CONTENT_REQUIRED')
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const sendEvent = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
    if (typeof (res as any).flush === 'function') {
      ;(res as any).flush()
    }
    if (typeof (res as any).flushHeaders === 'function') {
      ;(res as any).flushHeaders()
    }
  }

  try {
    const result = await deps.kbService.ingestTextStream(body.kbId, body.content, sendEvent)
    sendEvent({ type: 'complete', data: result })
  } catch (error: unknown) {
    const errorCode = error instanceof AppError ? error.code : 'INTERNAL_ERROR'
    const errorMessage = error instanceof Error ? error.message : '入库失败'

    sendEvent({
      type: 'error',
      data: { message: errorMessage, code: errorCode },
    })
  }

  try {
    res.end()
  } catch {
  }
}

async function handleMessagesIngest(req: NextApiRequest, res: NextApiResponse, deps: Deps) {
  const body = req.body as IngestMessagesRequest

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

  const result = await deps.kbService.ingestMessages(body.kbId, body.messages)
  return successResponse(res, result)
}
