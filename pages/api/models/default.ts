import type { NextApiRequest, NextApiResponse } from 'next'
import { ModelService } from '@/src/services/model.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  modelService: ModelService
}

/**
 * 获取默认模型 API
 */
export default createApiHandler<Deps>({
  dependencies: ['modelService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const capability = req.query.capability as string | undefined
        if (!capability) {
          return errorResponse(res, 'VALIDATION_ERROR', 'capability 参数为必填项', 400)
        }
        const model = await deps.modelService.getDefaultByCapability(capability as any)
        return successResponse(res, { model })
      },
    })
  }
})
