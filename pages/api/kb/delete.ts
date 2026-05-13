import type { NextApiRequest, NextApiResponse } from 'next'
import { withMiddleware, successResponse } from '@/src/lib/api-utils'
import { resolve } from '@/src/lib/container'
import { KBService } from '@/src/services/kb.service'
import { Errors } from '@/src/lib/errors'
import type { DeleteRequest } from '@/src/types'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body as DeleteRequest

  // 验证请求体
  if (!body.id || typeof body.id !== 'number') {
    throw Errors.badRequest('缺少必需字段: id (number)')
  }

  const kbService = resolve<KBService>('kbService')
  await kbService.delete(body.id)

  successResponse(res, { deleted: true, id: body.id })
}

export default withMiddleware(handler, { methods: ['POST'] })
