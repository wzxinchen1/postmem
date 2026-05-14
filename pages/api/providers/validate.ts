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

        const result = await deps.providerValidateService.validateProvider(
          type as ProviderType,
          apiKey,
          baseUrl
        )

        if (!result.valid) {
          return errorResponse(res, 'VALIDATION_ERROR', result.error || '验证失败', 400)
        }

        return successResponse(res, { valid: true })
      },
    })
  },
})
