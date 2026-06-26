import { NextRequest } from 'next/server'
import { ModelService } from '@/src/services/model.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateModelRequest } from '@/src/types'

interface Deps {
  modelService: ModelService
}

/**
 * 获取模型详情
 * @swagger
 * @response 200 返回模型详情
 */
export const GET = createApiHandler<Deps, { id: string }>({
  dependencies: ['modelService'],
  handler: async (deps, _request, { params }) => {
    const id = params.id

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    const model = await deps.modelService.get(id)
    if (!model) {
      return errorResponse('MODEL_NOT_FOUND')
    }

    return successResponse({ model })
  },
})

/**
 * 更新模型
 * @swagger
 * @response 200 更新成功，返回模型信息
 */
export const PUT = createApiHandler<Deps, { id: string }>({
  dependencies: ['modelService'],
  handler: async (deps, request, { params }) => {
    const id = params.id
    const data: UpdateModelRequest = await request.json()

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    const existing = await deps.modelService.get(id)
    if (!existing) {
      return errorResponse('MODEL_NOT_FOUND')
    }

    if (data.name && data.name !== existing.name) {
      const exists = await deps.modelService.exists(existing.providerId, data.name, id)
      if (exists) {
        return errorResponse('MODEL_NAME_DUPLICATE')
      }
    }

    const model = await deps.modelService.update(id, data)
    return successResponse({ model })
  },
})

/**
 * 删除模型
 * @swagger
 * @response 200 删除成功
 */
export const DELETE = createApiHandler<Deps, { id: string }>({
  dependencies: ['modelService'],
  handler: async (deps, _request, { params }) => {
    const id = params.id

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    const existing = await deps.modelService.get(id)
    if (!existing) {
      return errorResponse('MODEL_NOT_FOUND')
    }

    await deps.modelService.delete(id)
    return successResponse({ deleted: true })
  },
})
