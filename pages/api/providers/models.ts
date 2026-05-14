import type { NextApiRequest, NextApiResponse } from 'next'
import { ProviderValidateService } from '@/src/services/provider-validate.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { ProviderType } from '@/src/types'

interface Deps {
  providerValidateService: ProviderValidateService
}

export default createApiHandler<Deps>({
  dependencies: ['providerValidateService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      POST: async (deps) => {
        const { type, apiKey, baseUrl } = req.body

        if (!type) {
          return errorResponse(res, 'VALIDATION_ERROR', '提供商类型为必填项', 400)
        }

        const result = await deps.providerValidateService.fetchModels(
          type as ProviderType,
          apiKey,
          baseUrl
        )

        if (result.error) {
          return errorResponse(res, 'FETCH_ERROR', result.error, 400)
        }

        return successResponse(res, { models: result.models })
      },
    })
  },
})
