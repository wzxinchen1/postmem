import type { NextApiRequest, NextApiResponse } from 'next'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
import { KBService } from '@/src/services/kb.service'
import type { CreateKBRequest } from '@/src/types'

interface Deps {
  kbService: KBService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['kbService'],
  handler: async (req, res, deps) => {
    const body = req.body as CreateKBRequest
    const result = await deps.kbService.createKnowledgeBase(body.name, body.description)
    successResponse(res, result)
  }
})
