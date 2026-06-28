import { NextRequest } from 'next/server'
import { KBService } from '@/src/services/kb.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  kbService: KBService
}

export const POST = createApiHandler<Deps>({
  dependencies: ['kbService'],
  handler: async (deps, request) => {
    const body = await request.json()
    const memoryId = body.memoryId
    const chunks = body.chunks as Array<{ title: string; content: string; topicId: string | null }> | undefined

    if (!memoryId || typeof memoryId !== 'string') {
      return errorResponse('KB_CHUNK_SPLIT_MEMORY_ID_REQUIRED')
    }

    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return errorResponse('KB_CHUNK_SPLIT_CHUNKS_EMPTY')
    }

    for (const chunk of chunks) {
      if (!chunk.title || !chunk.content) {
        return errorResponse('KB_CHUNK_SPLIT_CHUNK_FIELDS_REQUIRED')
      }
    }

    const result = await deps.kbService.splitConfirm(memoryId, chunks)
    return successResponse(result)
  },
})
