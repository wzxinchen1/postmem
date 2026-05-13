import type { NextApiRequest, NextApiResponse } from 'next'
import { resolve } from '@/src/lib/container'
import { ModelService } from '@/src/services/model.service'
import { apiHandler, successResponse } from '@/src/lib/api-utils'

/**
 * 获取默认模型 API
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const modelService = resolve<ModelService>('modelService')

  await apiHandler(req, res, {
    GET: async () => {
      const modelType = req.query.modelType as string | undefined
      const model = await modelService.getDefault(modelType)
      return successResponse(res, { model })
    },
  })
}
