import { NextRequest } from 'next/server'
import { VendorService } from '@/src/services/vendor.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CreateVendorRequest } from '@/src/types'

interface Deps {
  vendorService: VendorService
}

export const GET = createApiHandler<Deps>({
  dependencies: ['vendorService'],
  handler: async (deps, request) => {
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
    const vendors = await deps.vendorService.list(includeInactive)
    return successResponse({ vendors })
  },
})

export const POST = createApiHandler<Deps>({
  dependencies: ['vendorService'],
  handler: async (deps, request) => {
    const data: CreateVendorRequest = await request.json()

    if (!data.name) {
      return errorResponse('VENDOR_NAME_REQUIRED')
    }

    const exists = await deps.vendorService.exists(data.name)
    if (exists) {
      return errorResponse('VENDOR_NAME_DUPLICATE')
    }

    const vendor = await deps.vendorService.create(data)
    return successResponse({ vendor }, 201)
  },
})
