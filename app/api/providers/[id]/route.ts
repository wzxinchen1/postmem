import { NextRequest } from 'next/server'
import { ProviderService } from '@/src/services/provider.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateProviderRequest } from '@/src/types'

export const dynamic = 'force-dynamic'

interface Deps {
  providerService: ProviderService
}

/**
 * 获取提供商详情
 * @swagger
 * @response 200 返回提供商详情
 */
export const GET = createApiHandler<Deps, { id: string }>({
  dependencies: ['providerService'],
  handler: async (deps, _request, { params }) => {
    const id = params.id

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    const provider = await deps.providerService.get(id)
    if (!provider) {
      return errorResponse('PROVIDER_NOT_FOUND')
    }

    return successResponse({ provider })
  },
})

/**
 * 更新提供商
 * @swagger
 * @response 200 更新成功，返回提供商信息
 */
export const PUT = createApiHandler<Deps, { id: string }>({
  dependencies: ['providerService'],
  handler: async (deps, request, { params }) => {
    const id = params.id
    const data: UpdateProviderRequest = await request.json()

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    const existing = await deps.providerService.get(id)
    if (!existing) {
      return errorResponse('PROVIDER_NOT_FOUND')
    }

    if (data.name && data.name !== existing.name) {
      const exists = await deps.providerService.exists(data.name, id)
      if (exists) {
        return errorResponse('PROVIDER_NAME_DUPLICATE')
      }
    }

    const provider = await deps.providerService.update(id, data)
    return successResponse({ provider })
  },
})

/**
 * 删除提供商
 * @swagger
 * @response 200 删除成功
 */
export const DELETE = createApiHandler<Deps, { id: string }>({
  dependencies: ['providerService'],
  handler: async (deps, _request, { params }) => {
    const id = params.id

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    const existing = await deps.providerService.get(id)
    if (!existing) {
      return errorResponse('PROVIDER_NOT_FOUND')
    }

    await deps.providerService.delete(id)
    return successResponse({ deleted: true })
  },
})
