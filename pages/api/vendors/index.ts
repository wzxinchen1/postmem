import type { NextApiRequest, NextApiResponse } from 'next'
import { VendorService } from '@/src/services/vendor.service'
import { createApiHandler, apiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CreateVendorRequest } from '@/src/types'

interface Deps {
  vendorService: VendorService
}

/**
 * 厂商列表和创建 API
 */
export default createApiHandler<Deps>({
  dependencies: ['vendorService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const includeInactive = req.query.includeInactive === 'true'
        const vendors = await deps.vendorService.list(includeInactive)
        return successResponse(res, { vendors })
      },

      POST: async (deps) => {
        const data = req.body as CreateVendorRequest

        if (!data.name) {
          return errorResponse(res, 'VALIDATION_ERROR', '名称为必填项', 400)
        }

        const exists = await deps.vendorService.exists(data.name)
        if (exists) {
          return errorResponse(res, 'DUPLICATE_ERROR', '厂商名称已存在', 409)
        }

        const vendor = await deps.vendorService.create(data)
        return successResponse(res, { vendor }, 201)
      },
    })
  }
})
