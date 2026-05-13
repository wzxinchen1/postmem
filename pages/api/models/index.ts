import type { NextApiRequest, NextApiResponse } from 'next'
import { resolve } from '@/src/lib/container'
import { ModelService } from '@/src/services/model.service'
import { apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CreateModelRequest } from '@/src/types'

/**
 * 模型列表和创建 API
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const modelService = resolve<ModelService>('modelService')

  await apiHandler(req, res, {
    GET: async () => {
      const includeInactive = req.query.includeInactive === 'true'
      const providerId = req.query.providerId ? Number(req.query.providerId) : undefined

      let models
      if (providerId) {
        models = await modelService.listByProvider(providerId, includeInactive)
      } else {
        models = await modelService.list(includeInactive)
      }

      return successResponse(res, { models })
    },

    POST: async () => {
      const data = req.body as CreateModelRequest

      // 验证必填字段
      if (!data.providerId || !data.name || !data.modelType) {
        return errorResponse(res, 'VALIDATION_ERROR', '提供商 ID、名称和模型类型为必填项', 400)
      }

      // 检查名称是否已存在
      const exists = await modelService.exists(data.providerId, data.name)
      if (exists) {
        return errorResponse(res, 'DUPLICATE_ERROR', '该提供商下模型名称已存在', 409)
      }

      const model = await modelService.create(data)
      return successResponse(res, { model }, 201)
    },
  })
}
