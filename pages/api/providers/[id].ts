import type { NextApiRequest, NextApiResponse } from 'next'
import { ProviderService } from '@/src/services/provider.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateProviderRequest } from '@/src/types'

interface Deps {
  providerService: ProviderService
}

/**
 * 单个提供商 API
 */
export default createApiHandler<Deps>({
  dependencies: ['providerService'],
  handler: async (req, res, deps) => {
    const id = req.query.id as string

    if (!id) {
      return errorResponse(res, 'VALIDATION_ERROR', '无效的 ID', 400)
    }

    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const provider = await deps.providerService.get(id)
        if (!provider) {
          return errorResponse(res, 'NOT_FOUND', '提供商不存在', 404)
        }
        return successResponse(res, { provider })
      },

      PUT: async (deps) => {
        const data = req.body as UpdateProviderRequest

        const existing = await deps.providerService.get(id)
        if (!existing) {
          return errorResponse(res, 'NOT_FOUND', '提供商不存在', 404)
        }

        if (data.name && data.name !== existing.name) {
          const exists = await deps.providerService.exists(data.name, id)
          if (exists) {
            return errorResponse(res, 'DUPLICATE_ERROR', '提供商名称已存在', 409)
          }
        }

        const provider = await deps.providerService.update(id, data)
        return successResponse(res, { provider })
      },

      DELETE: async (deps) => {
        const existing = await deps.providerService.get(id)
        if (!existing) {
          return errorResponse(res, 'NOT_FOUND', '提供商不存在', 404)
        }

        await deps.providerService.delete(id)
        return successResponse(res, { deleted: true })
      },
    })
  }
})
