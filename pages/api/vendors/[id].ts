import type { NextApiRequest, NextApiResponse } from 'next'
import { VendorService } from '@/src/services/vendor.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateVendorRequest } from '@/src/types'

interface Deps {
  vendorService: VendorService
}

/**
 * 单个厂商 API
 * @response.GET {Vendor} 200 - 成功响应
 * @response.PUT {Vendor} 200 - 更新成功
 * @response 404 - 资源不存在
 */
export default createApiHandler<Deps>({
  dependencies: ['vendorService'],
  handler: async (req, res, deps) => {
    const id = req.query.id as string

    if (!id) {
      return errorResponse('INVALID_ID')
    }

    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const vendor = await deps.vendorService.get(id)
        if (!vendor) {
          return errorResponse('VENDOR_NOT_FOUND')
        }
        return successResponse(res, { vendor })
      },

      PUT: async (deps) => {
        const data = req.body as UpdateVendorRequest

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
        return successResponse(res, { vendor })
      },

      DELETE: async (deps) => {
        const existing = await deps.vendorService.get(id)
        if (!existing) {
          return errorResponse('VENDOR_NOT_FOUND')
        }

        await deps.vendorService.delete(id)
        return successResponse(res, { deleted: true })
      },
    })
  }
})
