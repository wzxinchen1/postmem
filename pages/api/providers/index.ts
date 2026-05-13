import type { NextApiRequest, NextApiResponse } from 'next'
import { resolve } from '@/src/lib/container'
import { ProviderService } from '@/src/services/provider.service'
import { apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CreateProviderRequest } from '@/src/types'

/**
 * 提供商列表和创建 API
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const providerService = resolve<ProviderService>('providerService')

  await apiHandler(req, res, {
    GET: async () => {
      const includeInactive = req.query.includeInactive === 'true'
      const providers = await providerService.list(includeInactive)
      return successResponse(res, { providers })
    },

    POST: async () => {
      const data = req.body as CreateProviderRequest

      // 验证必填字段
      if (!data.name || !data.type) {
        return errorResponse(res, 'VALIDATION_ERROR', '名称和类型为必填项', 400)
      }

      // 检查名称是否已存在
      const exists = await providerService.exists(data.name)
      if (exists) {
        return errorResponse(res, 'DUPLICATE_ERROR', '提供商名称已存在', 409)
      }

      const provider = await providerService.create(data)
      return successResponse(res, { provider }, 201)
    },
  })
}
