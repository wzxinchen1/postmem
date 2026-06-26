import { NextRequest } from 'next/server'
import { ModelService } from '@/src/services/model.service'
import { createApiHandler, successResponse, errorResponse } from '@/src/lib/api-utils'
import type { CreateModelRequest } from '@/src/types'

interface Deps {
  modelService: ModelService
}

/**
 * 查询模型列表
 * @swagger
 * @response 200 返回模型列表
 * @query {string} includeInactive 是否包含已禁用的
 * @query {string} providerId 按提供商过滤
 */
export const GET = createApiHandler<Deps>({
  dependencies: ['modelService'],
  handler: async (deps, request) => {
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
    const providerId = request.nextUrl.searchParams.get('providerId') ?? undefined

    let models
    if (providerId) {
      models = await deps.modelService.listByProvider(providerId, includeInactive)
    } else {
      models = await deps.modelService.list(includeInactive)
    }

    return successResponse({ models })
  },
})

/**
 * 创建模型
 * @swagger
 * @response 201 创建成功，返回模型信息
 */
export const POST = createApiHandler<Deps>({
  dependencies: ['modelService'],
  handler: async (deps, request) => {
    const data: CreateModelRequest = await request.json()

    if (!data.providerId || !data.name || !data.capabilities || !Array.isArray(data.capabilities) || data.capabilities.length === 0) {
      return errorResponse('MODEL_NAME_AND_CAPABILITIES_REQUIRED')
    }

    const exists = await deps.modelService.exists(data.providerId, data.name)
    if (exists) {
      return errorResponse('MODEL_NAME_DUPLICATE')
    }

    const model = await deps.modelService.create(data)
    return successResponse({ model }, 201)
  },
})
