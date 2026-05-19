import { ModelService } from '@/src/services/model.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CreateModelRequest } from '@/src/types'

interface Deps {
  modelService: ModelService
}

/**
 * 模型列表和创建 API
 */
export default createApiHandler<Deps>({
  dependencies: ['modelService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const includeInactive = req.query.includeInactive === 'true'
        const providerId = req.query.providerId as string | undefined

        let models
        if (providerId) {
          models = await deps.modelService.listByProvider(providerId, includeInactive)
        } else {
          models = await deps.modelService.list(includeInactive)
        }

        return successResponse(res, { models })
      },

      POST: async (deps) => {
        const data = req.body as CreateModelRequest

        if (!data.providerId || !data.name || !data.capabilities || !Array.isArray(data.capabilities) || data.capabilities.length === 0) {
          return errorResponse(res, 'VALIDATION_ERROR', '提供商 ID、名称和能力标签为必填项', 400)
        }

        const exists = await deps.modelService.exists(data.providerId, data.name)
        if (exists) {
          return errorResponse(res, 'DUPLICATE_ERROR', '该提供商下模型名称已存在', 409)
        }

        const model = await deps.modelService.create(data)
        return successResponse(res, { model }, 201)
      },
    })
  }
})
