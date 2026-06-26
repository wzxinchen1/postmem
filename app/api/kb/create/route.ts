import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'
import type { CreateKBRequest } from '@/src/types'

interface Deps {
  kbService: KBService
}

export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body: CreateKBRequest = await request.json()
    const result = await deps.kbService.createKnowledgeBase(body.name, body.description)
    return successResponse(result)
  },
})
