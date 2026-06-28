import { NextRequest } from 'next/server'
import { ProviderService } from '@/src/services/provider.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CreateProviderRequest } from '@/src/types'

export const dynamic = 'force-dynamic'

interface Deps {
  providerService: ProviderService
}

/**
 * 查询提供商列表
 * @swagger
 * @response 200 返回提供商列表
 * @query {string} includeInactive 是否包含已禁用的
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['providerService'],
  handler: async (deps, request) => {
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
    const providers = await deps.providerService.list(includeInactive)
    return successResponse({ providers })
  },
})

/**
 * 创建提供商
 * @swagger
 * @response 201 创建成功，返回提供商信息
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['providerService'],
  handler: async (deps, request) => {
    const data: CreateProviderRequest = await request.json()

    if (!data.name || !data.baseUrl) {
      return errorResponse('PROVIDER_NAME_AND_BASE_URL_REQUIRED')
    }

    const exists = await deps.providerService.exists(data.name)
    if (exists) {
      return errorResponse('PROVIDER_NAME_DUPLICATE')
    }

    const provider = await deps.providerService.create(data)
    return successResponse({ provider }, 201)
  },
})
