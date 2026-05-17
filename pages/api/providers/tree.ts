import type { NextApiRequest, NextApiResponse } from 'next'
import { ProviderService } from '@/src/services/provider.service'
import { createApiHandler, apiHandler, successResponse } from '@/src/lib/api-utils'

interface Deps {
  providerService: ProviderService
}

/**
 * 提供商树形结构 API - 返回提供商及其下属模型的树
 */
export default createApiHandler<Deps>({
  dependencies: ['providerService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const includeInactive = req.query.includeInactive === 'true'
        const tree = await deps.providerService.getTree(includeInactive)
        return successResponse(res, { tree })
      },
    })
  }
})