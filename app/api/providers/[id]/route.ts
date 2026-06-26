import { NextRequest } from 'next/server'
import { ProviderService } from '@/src/services/provider.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateProviderRequest } from '@/src/types'

interface Deps {
  providerService: ProviderService
}

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
