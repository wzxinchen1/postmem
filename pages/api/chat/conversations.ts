import type { NextApiRequest, NextApiResponse } from 'next'
import { ConversationService } from '@/src/services/conversation.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  conversationService: ConversationService
}

export default createApiHandler<Deps>({
  dependencies: ['conversationService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const kbId = req.query.kbId as string | undefined
        const page = req.query.page ? Number(req.query.page) : 1
        const limit = req.query.limit ? Number(req.query.limit) : 20

        const result = await deps.conversationService.list({
          page,
          limit,
        } as any)

        return successResponse(res, result)
      },
      POST: async (deps) => {
        const { kbId } = req.body

        const conversation = await deps.conversationService.create({} as any)

        return successResponse(res, conversation)
      },
      DELETE: async (deps) => {
        const id = req.query.id as string
        if (!id) {
          return errorResponse('MISSING_ID')
        }

        await deps.conversationService.delete(id)
        return successResponse(res, { deleted: true })
      },
    })
  }
})