import { createApiHandler, apiHandler, successResponse } from '@/src/lib/api-utils'
import { InitService } from '@/src/services/init.service'
import { ProviderService } from '@/src/services/provider.service'
import { ProviderValidateService } from '@/src/services/provider-validate.service'
import { ModelService } from '@/src/services/model.service'
import { VendorService } from '@/src/services/vendor.service'

interface Deps {
  initService: InitService
  providerService: ProviderService
  providerValidateService: ProviderValidateService
  modelService: ModelService
  vendorService: VendorService
}

/**
 * 初始化默认提供商 API
 * @response 200 - 成功响应
 */
export default createApiHandler<Deps>({
  dependencies: ['initService', 'providerService', 'providerValidateService', 'modelService', 'vendorService'],
  handler: async (req, res, deps) => {
    await apiHandler(req, res, deps, {
      GET: async (deps) => {
        const results = await deps.initService.initDefaultProviders()
        return successResponse(res, results)
      },
    })
  }
})