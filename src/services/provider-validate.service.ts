import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { Vendor } from '@/src/types'
import { Errors } from '@/src/lib/errors'

export class ProviderValidateService {
  private prisma: PrismaClient

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  async validateProvider(
    vendorId: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ valid: boolean; error?: string; vendor?: Vendor; models: string[] }> {
    const result = await this.fetchModels(vendorId, apiKey, baseUrl)
    return { valid: result.models.length > 0, vendor: result.vendor, models: result.models }
  }

  async fetchModels(
    vendorId: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ models: string[]; vendor?: Vendor }> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    }) as Vendor | null

    if (!vendor) {
      throw Errors.badRequest('厂商不存在')
    }

    if (!baseUrl) {
      throw Errors.badRequest(`请填写 Base URL（默认：${vendor.url}）`)
    }

    if (vendor.chatModelClass === 'ChatOllama') {
      return await this.fetchOllamaModels(baseUrl, vendor)
    }

    return await this.fetchOpenAICompatibleModels(apiKey, baseUrl, vendor)
  }

  private async fetchOllamaModels(
    baseUrl: string,
    vendor: Vendor
  ): Promise<{ models: string[]; vendor: Vendor }> {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw Errors.internalError(`Ollama 请求失败: HTTP ${response.status}`)
    }

    const data = await response.json()

    if (!data.models || !Array.isArray(data.models)) {
      throw Errors.internalError('Ollama 响应格式无效: 缺少 models 数组')
    }

    const models = data.models.map((model: any) => model.name)

    return { models, vendor }
  }

  private async fetchOpenAICompatibleModels(
    apiKey: string | undefined,
    baseUrl: string,
    vendor: Vendor
  ): Promise<{ models: string[]; vendor: Vendor }> {
    if (!apiKey) {
      throw Errors.badRequest(`${vendor.name} 需要 API Key`)
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw Errors.internalError(`OpenAI 兼容 API 请求失败: HTTP ${response.status}`)
    }

    const data = await response.json()

    if (!data.data || !Array.isArray(data.data)) {
      throw Errors.internalError('OpenAI 兼容响应格式无效: 缺少 data 数组')
    }

    const models = data.data.map((model: any) => model.id)

    return { models, vendor }
  }
}
