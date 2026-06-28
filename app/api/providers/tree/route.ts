import { NextRequest } from 'next/server'
import { ProviderService } from '@/src/services/provider.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'

export const dynamic = 'force-dynamic'

interface Deps {
  providerService: ProviderService
}

/**
 * 获取提供商树形结构
 * @swagger
 * @response 200 返回树形结构
 * @query {string} includeInactive 是否包含已禁用的
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['providerService'],
  handler: async (deps, request) => {
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
    const tree = await deps.providerService.getTree(includeInactive)
    return successResponse({ tree })
  },
})
