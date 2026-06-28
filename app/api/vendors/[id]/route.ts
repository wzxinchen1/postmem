import { NextRequest } from 'next/server'
import { VendorService } from '@/src/services/vendor.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateVendorRequest } from '@/src/types'

export const dynamic = 'force-dynamic'

interface Deps {
  vendorService: VendorService
}

/**
 * 获取厂商详情
 * @swagger
 * @response 200 返回厂商详情
 */
export const GET = createApiHandler<Deps, { id: string }>({
  dependencies: ['vendorService'],
  handler: async (deps, _request, { params }) => {
    const id = params.id

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    const vendor = await deps.vendorService.get(id)
    if (!vendor) {
      return errorResponse('VENDOR_NOT_FOUND')
    }

    return successResponse({ vendor })
  },
})

/**
 * 更新厂商
 * @swagger
 * @response 200 更新成功，返回厂商信息
 */
export const PUT = createApiHandler<Deps, { id: string }>({
  dependencies: ['vendorService'],
  handler: async (deps, request, { params }) => {
    const id = params.id
    const data: UpdateVendorRequest = await request.json()

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    const existing = await deps.vendorService.get(id)
    if (!existing) {
      return errorResponse('VENDOR_NOT_FOUND')
    }

    if (data.name && data.name !== existing.name) {
      const exists = await deps.vendorService.exists(data.name, id)
      if (exists) {
        return errorResponse('VENDOR_NAME_DUPLICATE')
      }
    }

    const vendor = await deps.vendorService.update(id, data)
    return successResponse({ vendor })
  },
})

/**
 * 删除厂商
 * @swagger
 * @response 200 删除成功
 */
export const DELETE = createApiHandler<Deps, { id: string }>({
  dependencies: ['vendorService'],
  handler: async (deps, _request, { params }) => {
    const id = params.id

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    const existing = await deps.vendorService.get(id)
    if (!existing) {
      return errorResponse('VENDOR_NOT_FOUND')
    }

    await deps.vendorService.delete(id)
    return successResponse({ deleted: true })
  },
})
