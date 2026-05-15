import type { PrismaClient } from '@prisma/client'
import type { Vendor } from '@/src/types'

export class ProviderValidateService {
  private prisma: PrismaClient

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  /**
   * 验证提供商连接
   * 注意：在动态架构中，厂商信息从数据库获取，验证时需要指定 vendorId
   */
  async validateProvider(
    vendorId: number,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ valid: boolean; error?: string; vendor?: Vendor }> {
    if (!baseUrl) {
      return { valid: false, error: 'Base URL 为必填项' }
    }

    // 从数据库获取厂商信息
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    }) as Vendor | null

    if (!vendor) {
      return { valid: false, error: '厂商不存在' }
    }

    try {
      // 根据厂商的 chatModelClass 决定验证方式
      if (vendor.chatModelClass === 'ChatOllama') {
        // Ollama 不需要 API Key
        return await this.validateOllama(baseUrl, vendor)
      }

      // 其他厂商使用 OpenAI 兼容的验证方式
      return await this.validateOpenAICompatible(apiKey, baseUrl, vendor)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '验证失败'
      return { valid: false, error: errorMessage }
    }
  }

  /**
   * 验证 Ollama 连接
   */
  private async validateOllama(
    baseUrl: string,
    vendor: Vendor
  ): Promise<{ valid: boolean; error?: string; vendor?: Vendor }> {
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return { valid: false, error: `连接失败: ${response.status}`, vendor }
      }

      return { valid: true, vendor }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '验证失败'
      if (errorMessage.includes('timeout')) {
        return { valid: false, error: '连接超时', vendor }
      }
      return { valid: false, error: `连接失败: ${errorMessage}`, vendor }
    }
  }

  /**
   * 验证 OpenAI 兼容的提供商
   */
  private async validateOpenAICompatible(
    apiKey?: string,
    baseUrl: string,
    vendor: Vendor
  ): Promise<{ valid: boolean; error?: string; vendor?: Vendor }> {
    if (!apiKey) {
      return { valid: false, error: `${vendor.name} 需要 API Key`, vendor }
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }
    const testUrl = `${baseUrl}/v1/chat/completions`

    try {
      const response = await fetch(testUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'test',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (response.status === 401) {
        return { valid: false, error: 'API Key 无效', vendor }
      }

      if (response.status === 403) {
        return { valid: false, error: 'API Key 权限不足', vendor }
      }

      return { valid: true, vendor }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '验证失败'
      if (errorMessage.includes('timeout')) {
        return { valid: false, error: '连接超时', vendor }
      }
      return { valid: false, error: `连接失败: ${errorMessage}`, vendor }
    }
  }

  /**
   * 获取可用模型列表
   * 注意：在动态架构中，模型列表从数据库获取或通过 API 动态获取
   */
  async fetchModels(
    vendorId: number,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ models: string[]; error?: string; vendor?: Vendor }> {
    if (!baseUrl) {
      return { models: [], error: 'Base URL 为必填项' }
    }

    // 从数据库获取厂商信息
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    }) as Vendor | null

    if (!vendor) {
      return { models: [], error: '厂商不存在' }
    }

    try {
      // 根据厂商类型选择获取模型的方式
      if (vendor.chatModelClass === 'ChatOllama') {
        return await this.fetchOllamaModels(baseUrl, vendor)
      }

      // 其他厂商尝试通过 OpenAI 兼容的 API 获取
      return await this.fetchOpenAICompatibleModels(apiKey, baseUrl, vendor)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage, vendor }
    }
  }

  /**
   * 获取 Ollama 模型列表
   */
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
      const models = data.models?.map((model: any) => model.name) || []

      return { models, vendor }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage, vendor }
    }
  }

  /**
   * 获取 OpenAI 兼容厂商的模型列表
   */
  private async fetchOpenAICompatibleModels(
    apiKey?: string,
    baseUrl: string,
    vendor: Vendor
  ): Promise<{ models: string[]; error?: string; vendor?: Vendor }> {
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return { models: [], error: `请求失败: ${response.status}`, vendor }
      }

      const data = await response.json()
      const models = data.data?.map((model: any) => model.id) || []

      return { models, vendor }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage, vendor }
    }
  }
}
