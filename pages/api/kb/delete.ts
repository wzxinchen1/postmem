import type { NextApiRequest, NextApiResponse } from 'next'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
import { KBService } from '@/src/services/kb.service'
import { Errors } from '@/src/lib/errors'
import type { DeleteRequest } from '@/src/types'

interface Deps {
  kbService: KBService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['kbService'],
  handler: async (req, res, deps) => {
    const body = req.body as DeleteRequest

    if (!body.id || typeof body.id !== 'number') {
      throw Errors.badRequest('缺少必需字段: id (number)')
    }

    await deps.kbService.delete(body.id)
    successResponse(res, { deleted: true, id: body.id })
  }
})
