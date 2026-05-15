import type { NextApiRequest, NextApiResponse } from 'next'
import { ProviderValidateService } from '@/src/services/provider-validate.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  providerValidateService: ProviderValidateService
}

export default createApiHandler<Deps>({
  dependencies: ['providerValidateService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      POST: async (deps) => {
        const { vendorId, apiKey, baseUrl } = req.body

        if (!baseUrl) {
          return errorResponse(res, 'VALIDATION_ERROR', 'Base URL为必填项', 400)
        }

        if (!vendorId) {
          return errorResponse(res, 'VALIDATION_ERROR', '厂商ID为必填项', 400)
        }

        const result = await deps.providerValidateService.fetchModels(
          vendorId,
          apiKey,
          baseUrl
        )

        if (result.error) {
          return errorResponse(res, 'FETCH_ERROR', result.error, 400)
        }

        return successResponse(res, { models: result.models, vendor: result.vendor })
      },
    })
  },
})
