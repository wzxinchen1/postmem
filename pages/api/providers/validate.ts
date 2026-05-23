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

        if (!vendorId) {
          return errorResponse('PROVIDER_VENDOR_ID_REQUIRED')
        }

        const result = await deps.providerValidateService.validateProvider(
          vendorId,
          apiKey,
          baseUrl
        )

        if (!result.valid) {
          return errorResponse('PROVIDER_VALIDATE_FAILED')
        }

        return successResponse(res, { valid: true, models: result.models })
      },
    })
  },
})
