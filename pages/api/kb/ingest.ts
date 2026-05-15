import type { NextApiRequest, NextApiResponse } from 'next'
import { container } from '@/src/lib/container'
import { KBService } from '@/src/services/kb.service'
import { Errors, AppError } from '@/src/lib/errors'
import type { IngestTextRequest, IngestMessagesRequest, IngestMessage } from '@/src/types'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求' } })
    return
  }

  const body = req.body

  if (!body.kbId || typeof body.kbId !== 'number') {
    res.status(400).json({ success: false, error: Errors.badRequest('缺少必需字段: kbId') })
    return
  }

  if (body.messages && Array.isArray(body.messages)) {
    return await handleMessagesIngest(req, res)
  } else if (body.content && typeof body.content === 'string') {
    return await handleTextIngestStream(req, res)
  } else {
    res.status(400).json({ success: false, error: Errors.badRequest('需要提供 content（纯文本）或 messages（消息列表）') })
    return
  }
}

async function handleTextIngestStream(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body as IngestTextRequest

  if (!body.content || typeof body.content !== 'string') {
    res.status(400).json({ success: false, error: Errors.badRequest('缺少必需字段: content') })
    return
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
    const kbService = container.resolve<KBService>('kbService')

    const result = await kbService.ingestTextStream(body.kbId, body.content, sendEvent)

    sendEvent({ type: 'complete', data: result })
  } catch (error: unknown) {
    let errorMessage = '入库失败'
    let errorCode = 'INTERNAL_ERROR'

    if (error instanceof AppError) {
      errorMessage = error.details || error.message
      errorCode = error.code
    } else if (error instanceof Error) {
      errorMessage = error.message
    }

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

async function handleMessagesIngest(req: NextApiRequest, res: NextApiResponse) {
  const kbService = container.resolve<KBService>('kbService')

  const body = req.body as IngestMessagesRequest

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ success: false, error: Errors.badRequest('缺少必需字段: messages（非空数组）') })
    return
  }

  for (const msg of body.messages) {
    if (!msg.id || typeof msg.id !== 'string') {
      res.status(400).json({ success: false, error: Errors.badRequest('每条消息必须包含 id 字段') })
      return
    }
    if (!msg.role || typeof msg.role !== 'string') {
      res.status(400).json({ success: false, error: Errors.badRequest('每条消息必须包含 role 字段') })
      return
    }
    if (!msg.content || typeof msg.content !== 'string') {
      res.status(400).json({ success: false, error: Errors.badRequest('每条消息必须包含 content 字段') })
      return
    }
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      res.status(400).json({ success: false, error: Errors.badRequest(`消息角色必须是 system、user 或 assistant，当前为: ${msg.role}`) })
      return
    }
  }

  try {
    const result = await kbService.ingestMessages(body.kbId, body.messages)
    res.status(200).json({ success: true, data: result })
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string }
    res.status(500).json({
      success: false,
      error: { code: err.code || 'INTERNAL_ERROR', message: err.message || '入库失败' },
    })
  }
}
