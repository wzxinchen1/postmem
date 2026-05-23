import type { NextApiRequest, NextApiResponse } from 'next'
import { ProviderService } from '@/src/services/provider.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CreateProviderRequest } from '@/src/types'

interface Deps {
  providerService: ProviderService
}

/**
 * 提供商列表和创建 API
 */
export default createApiHandler<Deps>({
  dependencies: ['providerService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const includeInactive = req.query.includeInactive === 'true'
        const providers = await deps.providerService.list(includeInactive)
        return successResponse(res, { providers })
      },

      POST: async (deps) => {
        const data = req.body as CreateProviderRequest

        if (!data.name || !data.baseUrl) {
          return errorResponse('PROVIDER_NAME_AND_BASE_URL_REQUIRED')
        }

        const exists = await deps.providerService.exists(data.name)
        if (exists) {
          return errorResponse('PROVIDER_NAME_DUPLICATE')
        }

        const provider = await deps.providerService.create(data)
        return successResponse(res, { provider }, 201)
      },
    })
  }
})
