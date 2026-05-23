import type { NextApiRequest, NextApiResponse } from 'next'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import { KBService } from '@/src/services/kb.service'
import type { DeleteRequest } from '@/src/types'

interface Deps {
  kbService: KBService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['kbService'],
  handler: async (req, res, deps) => {
    const body = req.body as DeleteRequest

    if (!body.id || typeof body.id !== 'string') {
      return errorResponse('MISSING_ID')
    }

    await deps.kbService.delete(body.id)
    successResponse(res, { deleted: true, id: body.id })
  }
})
