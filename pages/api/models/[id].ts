import type { NextApiRequest, NextApiResponse } from 'next'
import { ModelService } from '@/src/services/model.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateModelRequest } from '@/src/types'

interface Deps {
  modelService: ModelService
}

/**
 * 单个模型 API
 */
export default createApiHandler<Deps>({
  dependencies: ['modelService'],
  handler: async (req, res, deps) => {
    const id = req.query.id as string

    if (!id) {
      return errorResponse(res, 'VALIDATION_ERROR', '无效的 ID', 400)
    }

    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const model = await deps.modelService.get(id)
        if (!model) {
          return errorResponse(res, 'NOT_FOUND', '模型不存在', 404)
        }
        return successResponse(res, { model })
      },

      PUT: async (deps) => {
        const data = req.body as UpdateModelRequest

        const existing = await deps.modelService.get(id)
        if (!existing) {
          return errorResponse(res, 'NOT_FOUND', '模型不存在', 404)
        }

        if (data.name && data.name !== existing.name) {
          const exists = await deps.modelService.exists(existing.providerId, data.name, id)
          if (exists) {
            return errorResponse(res, 'DUPLICATE_ERROR', '该提供商下模型名称已存在', 409)
          }
        }

        const model = await deps.modelService.update(id, data)
        return successResponse(res, { model })
      },

      DELETE: async (deps) => {
        const existing = await deps.modelService.get(id)
        if (!existing) {
          return errorResponse(res, 'NOT_FOUND', '模型不存在', 404)
        }

        await deps.modelService.delete(id)
        return successResponse(res, { deleted: true })
      },
    })
  }
})
