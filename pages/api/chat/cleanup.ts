import type { NextApiRequest, NextApiResponse } from 'next'
import { SSEService } from '@/src/services/sse.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'

interface Deps {
  sseService: SSEService
}

export default createApiHandler<Deps>({
  methods: ['POST'],
  dependencies: ['sseService'],
  handler: async (req, res, deps) => {
    const { conversationId } = req.body ?? {}

    await deps.sseService.clearMessageStream()

    if (conversationId) {
      await deps.sseService.clearCancelled(conversationId)
    }

    return successResponse(res, { success: true })
  }
})
