import { NextRequest } from 'next/server'
import type { FetchModelsRequest } from '@/src/types'
import { ProviderValidateService } from '@/src/services/provider-validate.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  providerValidateService: ProviderValidateService
}

export const POST = createApiHandler<Deps>({
  dependencies: ['providerValidateService'],
  handler: async (deps, request) => {
    const body: FetchModelsRequest = await request.json()
    const { vendorId, apiKey, baseUrl } = body

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

    return successResponse({ valid: true, models: result.models })
  },
})
