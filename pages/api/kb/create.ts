import type { NextApiRequest, NextApiResponse } from 'next'
import { withMiddleware, successResponse } from '@/src/lib/api-utils'
import { resolve } from '@/src/lib/container'
import { KBService } from '@/src/services/kb.service'
import type { CreateKBRequest } from '@/src/types'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const body = req.body as CreateKBRequest

  const kbService = resolve<KBService>('kbService')
  const result = await kbService.createKnowledgeBase(body.name, body.description)

  successResponse(res, result)
}

export default withMiddleware(handler, { methods: ['POST'] })
