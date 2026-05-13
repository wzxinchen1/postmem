import type { NextApiRequest, NextApiResponse } from 'next'
import { resolve } from '@/src/lib/container'
import { ModelService } from '@/src/services/model.service'
import { apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateModelRequest } from '@/src/types'

/**
 * 单个模型 API
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const modelService = resolve<ModelService>('modelService')
  const id = Number(req.query.id)

  if (isNaN(id)) {
    return errorResponse(res, 'VALIDATION_ERROR', '无效的 ID', 400)
  }

  await apiHandler(req, res, {
    GET: async () => {
      const model = await modelService.get(id)
      if (!model) {
        return errorResponse(res, 'NOT_FOUND', '模型不存在', 404)
      }
      return successResponse(res, { model })
    },

    PUT: async () => {
      const data = req.body as UpdateModelRequest

      // 检查模型是否存在
      const existing = await modelService.get(id)
      if (!existing) {
        return errorResponse(res, 'NOT_FOUND', '模型不存在', 404)
      }

      // 如果更新名称，检查是否重复
      if (data.name && data.name !== existing.name) {
        const exists = await modelService.exists(existing.providerId, data.name, id)
        if (exists) {
          return errorResponse(res, 'DUPLICATE_ERROR', '该提供商下模型名称已存在', 409)
        }
      }

      const model = await modelService.update(id, data)
      return successResponse(res, { model })
    },

    DELETE: async () => {
      // 检查模型是否存在
      const existing = await modelService.get(id)
      if (!existing) {
        return errorResponse(res, 'NOT_FOUND', '模型不存在', 404)
      }

      await modelService.delete(id)
      return successResponse(res, { deleted: true })
    },
  })
}
