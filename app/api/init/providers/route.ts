import { InitService } from '@/src/services/init.service'
import { ProviderService } from '@/src/services/provider.service'
import { ProviderValidateService } from '@/src/services/provider-validate.service'
import { ModelService } from '@/src/services/model.service'
import { VendorService } from '@/src/services/vendor.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'

interface Deps {
  initService: InitService
  providerService: ProviderService
  providerValidateService: ProviderValidateService
  modelService: ModelService
  vendorService: VendorService
}

export const GET = createApiHandler<Deps>({
  dependencies: ['initService', 'providerService', 'providerValidateService', 'modelService', 'vendorService'],
  handler: async (deps) => {
    const results = await deps.initService.initDefaultProviders()
    return successResponse(results)
  },
})
