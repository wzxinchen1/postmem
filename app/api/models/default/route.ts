import { NextRequest } from 'next/server'
import { ModelService } from '@/src/services/model.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  modelService: ModelService
}

export const GET = createApiHandler<Deps>({
  dependencies: ['modelService'],
  handler: async (deps, request) => {
    const capability = request.nextUrl.searchParams.get('capability')
    if (!capability) {
      return errorResponse('MODEL_CAPABILITY_REQUIRED')
    }
    const model = await deps.modelService.getDefaultByCapability(capability as any)
    return successResponse({ model })
  },
})
