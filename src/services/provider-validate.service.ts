import { ChatOpenAI } from '@langchain/openai'
import { VendorRegistryService } from './vendor-registry.service'
import type { VendorInfo } from '@/src/types'

export class ProviderValidateService {
  private vendorRegistry: VendorRegistryService

  constructor() {
    this.vendorRegistry = new VendorRegistryService()
  }

  async validateProvider(
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ valid: boolean; error?: string; vendor?: VendorInfo }> {
    if (!baseUrl) {
      return { valid: false, error: 'Base URL 为必填项' }
    }

    const vendor = this.vendorRegistry.identify(baseUrl)

    try {
      switch (vendor.apiFormat) {
        case 'openai':
        case 'anthropic':
        case 'alibaba':
        case 'zhipu':
        case 'deepseek':
        case 'openrouter':
          return await this.validateOpenAICompatible(apiKey, baseUrl, vendor)
        case 'baidu':
        case 'tencent':
          return { valid: true, vendor }
        default:
          return await this.validateOpenAICompatible(apiKey, baseUrl, vendor)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '验证失败'
      return { valid: false, error: errorMessage }
    }
  }

  private async validateOpenAICompatible(
    apiKey?: string,
    baseUrl: string,
    vendor: VendorInfo
  ): Promise<{ valid: boolean; error?: string; vendor?: VendorInfo }> {
    if (vendor.authType !== 'custom' && !apiKey) {
      return { valid: false, error: `${vendor.name} 需要 API Key` }
    }

    const headers = this.vendorRegistry.buildAuthHeaders(vendor, apiKey || 'test')
    const testUrl = this.vendorRegistry.buildRequestUrl(baseUrl, vendor)

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

  async fetchModels(
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ models: string[]; error?: string; vendor?: VendorInfo }> {
    if (!baseUrl) {
      return { models: [], error: 'Base URL 为必填项' }
    }

    const vendor = this.vendorRegistry.identify(baseUrl)

    try {
      switch (vendor.apiFormat) {
        case 'openai':
          return await this.fetchOpenAIModels(apiKey, vendor)
        case 'anthropic':
          return await this.fetchAnthropicModels(vendor)
        case 'openrouter':
          return await this.fetchOpenRouterModels(apiKey, vendor)
        case 'deepseek':
          return await this.fetchDeepSeekModels(apiKey, vendor)
        case 'alibaba':
          return await this.fetchAlibabaModels(vendor)
        case 'zhipu':
          return await this.fetchZhipuModels(vendor)
        default:
          return await this.fetchGenericModels(apiKey, baseUrl, vendor)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage, vendor }
    }
  }

  private async fetchOpenAIModels(
    apiKey?: string,
    vendor: VendorInfo
  ): Promise<{ models: string[]; error?: string; vendor?: VendorInfo }> {
    if (!apiKey) {
      return { models: [], error: '需要 API Key', vendor }
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        const errorMessage = response.status === 401 ? 'API Key 无效' : `请求失败: ${response.status}`
        return { models: [], error: errorMessage, vendor }
      }

      const data = await response.json()
      const models = data.data
        .map((model: any) => model.id)
        .filter((id: string) =>
          id.includes('gpt') ||
          id.includes('text-embedding') ||
          id.includes('o1') ||
          id.includes('o3')
        )
        .sort()

      return { models, vendor }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage, vendor }
    }
  }

  private async fetchAnthropicModels(
    vendor: VendorInfo
  ): Promise<{ models: string[]; error?: string; vendor?: VendorInfo }> {
    return {
      models: [
        'claude-opus-4-7-20260514',
        'claude-sonnet-4-6-20260514',
        'claude-haiku-4-5-20260514',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ],
      vendor,
    }
  }

  private async fetchOpenRouterModels(
    apiKey?: string,
    vendor: VendorInfo
  ): Promise<{ models: string[]; error?: string; vendor?: VendorInfo }> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return { models: [], error: `请求失败: ${response.status}`, vendor }
      }

      const data = await response.json()
      const models = data.data?.map((model: any) => model.id).sort() || []

      return { models, vendor }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage, vendor }
    }
  }

  private async fetchDeepSeekModels(
    apiKey?: string,
    vendor: VendorInfo
  ): Promise<{ models: string[]; error?: string; vendor?: VendorInfo }> {
    return {
      models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
      vendor,
    }
  }

  private async fetchAlibabaModels(
    vendor: VendorInfo
  ): Promise<{ models: string[]; error?: string; vendor?: VendorInfo }> {
    return {
      models: [
        'qwen-max',
        'qwen-plus',
        'qwen-turbo',
        'qwen3-max',
        'qwen3-plus',
        'qwen3-turbo',
        'qwen3-vl-plus',
        'qwen-coder-plus',
      ],
      vendor,
    }
  }

  private async fetchZhipuModels(
    vendor: VendorInfo
  ): Promise<{ models: string[]; error?: string; vendor?: VendorInfo }> {
    return {
      models: ['glm-4-plus', 'glm-4', 'glm-4-air', 'glm-4-flash'],
      vendor,
    }
  }

  private async fetchGenericModels(
    apiKey?: string,
    baseUrl: string,
    vendor: VendorInfo
  ): Promise<{ models: string[]; error?: string; vendor?: VendorInfo }> {
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
