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
    return { valid: result.models.length > 0, error: result.error, vendor: result.vendor, models: result.models }
  }

  async fetchModels(
    vendorId: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ models: string[]; error?: string; vendor?: Vendor }> {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    }) as Vendor | null

    if (!vendor) {
      return { models: [], error: '厂商不存在' }
    }

    if (!baseUrl) {
      return { models: [], error: `请填写 Base URL（默认：${vendor.url}）` }
    }

    try {
      if (vendor.chatModelClass === 'ChatOllama') {
        return await this.fetchOllamaModels(baseUrl, vendor)
      }

      return await this.fetchOpenAICompatibleModels(apiKey, baseUrl, vendor)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage, vendor }
    }
  }

  private async fetchOllamaModels(
    baseUrl: string,
    vendor: Vendor
  ): Promise<{ models: string[]; error?: string; vendor?: Vendor }> {
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return { models: [], error: `请求失败: ${response.status}`, vendor }
      }

      const data = await response.json()

      if (!data.models || !Array.isArray(data.models)) {
        return { models: [], error: 'Ollama 响应格式无效: 缺少 models 数组', vendor }
      }

      const models = data.models.map((model: any) => model.name)

      return { models, vendor }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage, vendor }
    }
  }

  private async fetchOpenAICompatibleModels(
    apiKey?: string,
    baseUrl: string,
    vendor: Vendor
  ): Promise<{ models: string[]; error?: string; vendor?: Vendor }> {
    if (!apiKey) {
      return { models: [], error: `${vendor.name} 需要 API Key`, vendor }
    }

    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return { models: [], error: `请求失败: ${response.status}`, vendor }
      }

      const data = await response.json()

      if (!data.data || !Array.isArray(data.data)) {
        return { models: [], error: 'OpenAI 兼容响应格式无效: 缺少 data 数组', vendor }
      }

      const models = data.data.map((model: any) => model.id)

      return { models, vendor }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage, vendor }
    }
  }
}