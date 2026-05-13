import type { NextApiRequest, NextApiResponse } from 'next'
import { withMiddleware, successResponse } from '@/src/lib/api-utils'
import { resolve } from '@/src/lib/container'
import { KBService } from '@/src/services/kb.service'
import { Errors } from '@/src/lib/errors'
import type { IngestRequest } from '@/src/types'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body as IngestRequest

  // 验证请求体
  if (!body.kbName || typeof body.kbName !== 'string') {
    throw Errors.badRequest('缺少必需字段: kbName')
  }

  if (!body.content || typeof body.content !== 'string') {
    throw Errors.badRequest('缺少必需字段: content')
  }

  const kbService = resolve<KBService>('kbService')
  const result = await kbService.ingest(body.kbName, body.content)

  successResponse(res, result)
}

export default withMiddleware(handler, { methods: ['POST'] })
