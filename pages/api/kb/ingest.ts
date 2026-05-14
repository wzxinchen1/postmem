import type { NextApiRequest, NextApiResponse } from 'next'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
import { KBService } from '@/src/services/kb.service'
import { Errors } from '@/src/lib/errors'
import type { IngestTextRequest, IngestMessagesRequest, IngestMessage } from '@/src/types'

interface Deps {
  kbService: KBService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['kbService'],
  handler: async (req, res, deps) => {
    const body = req.body

    if (!body.kbId || typeof body.kbId !== 'number') {
      throw Errors.badRequest('缺少必需字段: kbId')
    }

    if (body.messages && Array.isArray(body.messages)) {
      return await handleMessagesIngest(req, res, deps)
    } else if (body.content && typeof body.content === 'string') {
      return await handleTextIngest(req, res, deps)
    } else {
      throw Errors.badRequest('需要提供 content（纯文本）或 messages（消息列表）')
    }
  }
})

async function handleTextIngest(req: NextApiRequest, res: NextApiResponse, deps: Deps) {
  const body = req.body as IngestTextRequest

  if (!body.content || typeof body.content !== 'string') {
    throw Errors.badRequest('缺少必需字段: content')
  }

  const result = await deps.kbService.ingestText(body.kbId, body.content)
  successResponse(res, result)
}

async function handleMessagesIngest(req: NextApiRequest, res: NextApiResponse, deps: Deps) {
  const body = req.body as IngestMessagesRequest

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    throw Errors.badRequest('缺少必需字段: messages（非空数组）')
  }

  for (const msg of body.messages) {
    if (!msg.id || typeof msg.id !== 'string') {
      throw Errors.badRequest('每条消息必须包含 id 字段')
    }
    if (!msg.role || typeof msg.role !== 'string') {
      throw Errors.badRequest('每条消息必须包含 role 字段')
    }
    if (!msg.content || typeof msg.content !== 'string') {
      throw Errors.badRequest('每条消息必须包含 content 字段')
    }
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      throw Errors.badRequest(`消息角色必须是 system、user 或 assistant，当前为: ${msg.role}`)
    }
  }

  const result = await deps.kbService.ingestMessages(body.kbId, body.messages)
  successResponse(res, result)
}
