import type { NextApiRequest, NextApiResponse } from 'next'
import { VendorService } from '@/src/services/vendor.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { UpdateVendorRequest } from '@/src/types'

interface Deps {
  vendorService: VendorService
}

/**
 * 单个厂商 API
 */
export default createApiHandler<Deps>({
  dependencies: ['vendorService'],
  handler: async (req, res, deps) => {
    const id = Number(req.query.id)

    if (isNaN(id)) {
      return errorResponse(res, 'VALIDATION_ERROR', '无效的 ID', 400)
    }

    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const vendor = await deps.vendorService.get(id)
        if (!vendor) {
          return errorResponse(res, 'NOT_FOUND', '厂商不存在', 404)
        }
        return successResponse(res, { vendor })
      },

      PUT: async (deps) => {
        const data = req.body as UpdateVendorRequest

        const existing = await deps.vendorService.get(id)
        if (!existing) {
          return errorResponse(res, 'NOT_FOUND', '厂商不存在', 404)
        }

        if (data.name && data.name !== existing.name) {
          const exists = await deps.vendorService.exists(data.name, id)
          if (exists) {
            return errorResponse(res, 'DUPLICATE_ERROR', '厂商名称已存在', 409)
          }
        }

        const vendor = await deps.vendorService.update(id, data)
        return successResponse(res, { vendor })
      },

      DELETE: async (deps) => {
        const existing = await deps.vendorService.get(id)
        if (!existing) {
          return errorResponse(res, 'NOT_FOUND', '厂商不存在', 404)
        }

        await deps.vendorService.delete(id)
        return successResponse(res, { deleted: true })
      },
    })
  }
})
