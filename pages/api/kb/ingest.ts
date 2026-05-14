import type { NextApiRequest, NextApiResponse } from 'next'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
import { KBService } from '@/src/services/kb.service'
import { Errors } from '@/src/lib/errors'
import type { IngestRequest } from '@/src/types'

interface Deps {
  kbService: KBService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['kbService'],
  handler: async (req, res, deps) => {
    const body = req.body as IngestRequest

    if (!body.kbName || typeof body.kbName !== 'string') {
      throw Errors.badRequest('缺少必需字段: kbName')
    }

    if (!body.content || typeof body.content !== 'string') {
      throw Errors.badRequest('缺少必需字段: content')
    }

    const result = await deps.kbService.ingest(body.kbName, body.content)
    successResponse(res, result)
  }
})
