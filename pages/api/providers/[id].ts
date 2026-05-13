import type { NextApiRequest, NextApiResponse } from 'next'
import { resolve } from '@/src/lib/container'
import { ProviderService } from '@/src/services/provider.service'
import { apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateProviderRequest } from '@/src/types'

/**
 * 单个提供商 API
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const providerService = resolve<ProviderService>('providerService')
  const id = Number(req.query.id)

  if (isNaN(id)) {
    return errorResponse(res, 'VALIDATION_ERROR', '无效的 ID', 400)
  }

  await apiHandler(req, res, {
    GET: async () => {
      const provider = await providerService.get(id)
      if (!provider) {
        return errorResponse(res, 'NOT_FOUND', '提供商不存在', 404)
      }
      return successResponse(res, { provider })
    },

    PUT: async () => {
      const data = req.body as UpdateProviderRequest

      // 检查提供商是否存在
      const existing = await providerService.get(id)
      if (!existing) {
        return errorResponse(res, 'NOT_FOUND', '提供商不存在', 404)
      }

      // 如果更新名称，检查是否重复
      if (data.name && data.name !== existing.name) {
        const exists = await providerService.exists(data.name, id)
        if (exists) {
          return errorResponse(res, 'DUPLICATE_ERROR', '提供商名称已存在', 409)
        }
      }

      const provider = await providerService.update(id, data)
      return successResponse(res, { provider })
    },

    DELETE: async () => {
      // 检查提供商是否存在
      const existing = await providerService.get(id)
      if (!existing) {
        return errorResponse(res, 'NOT_FOUND', '提供商不存在', 404)
      }

      await providerService.delete(id)
      return successResponse(res, { deleted: true })
    },
  })
}
