import { NextRequest } from 'next/server'
import { ModelService } from '@/src/services/model.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'

interface Deps {
  modelService: ModelService
}

/**
 * 获取指定能力的默认模型
 * @swagger
 * @response 200 返回默认模型
 * @query {string} capability 模型能力类型
 */
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
