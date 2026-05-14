import { ChatOpenAI } from '@langchain/openai'
import { ChatOllama } from '@langchain/ollama'
import type { ProviderType } from '@/src/types'

export class ProviderValidateService {
  async validateProvider(
    type: ProviderType,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      switch (type) {
        case 'openai':
          return await this.validateOpenAI(apiKey)
        case 'anthropic':
          return await this.validateAnthropic(apiKey)
        case 'local':
          return await this.validateOllama(baseUrl)
        case 'custom':
          return await this.validateCustom(apiKey, baseUrl)
        default:
          return { valid: false, error: '不支持的提供商类型' }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '验证失败'
      return { valid: false, error: errorMessage }
    }
  }

  private async validateOpenAI(apiKey?: string): Promise<{ valid: boolean; error?: string }> {
    if (!apiKey) {
      return { valid: false, error: 'OpenAI 需要 API Key' }
    }

    const chatModel = new ChatOpenAI({
      model: 'gpt-3.5-turbo',
      apiKey,
      configuration: {
        baseURL: 'https://api.openai.com/v1',
      },
    })

    try {
      await chatModel.invoke(['Hello'])
      return { valid: true }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '验证失败'
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        return { valid: false, error: 'API Key 无效' }
      }
      if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        return { valid: false, error: 'API Key 权限不足' }
      }
      return { valid: false, error: `连接失败: ${errorMessage}` }
    }
  }

  private async validateAnthropic(apiKey?: string): Promise<{ valid: boolean; error?: string }> {
    if (!apiKey) {
      return { valid: false, error: 'Anthropic 需要 API Key' }
    }

    return { valid: true }
  }

  private async validateOllama(baseUrl?: string): Promise<{ valid: boolean; error?: string }> {
    const url = baseUrl || 'http://localhost:11434'

    try {
      const response = await fetch(`${url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        return { valid: false, error: `Ollama 服务响应错误: ${response.status}` }
      }

      return { valid: true }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '连接失败'
      if (errorMessage.includes('timeout')) {
        return { valid: false, error: '连接超时，请检查 Ollama 服务是否运行' }
      }
      return { valid: false, error: `无法连接到 Ollama 服务: ${errorMessage}` }
    }
  }

  private async validateCustom(apiKey?: string, baseUrl?: string): Promise<{ valid: boolean; error?: string }> {
    if (!baseUrl) {
      return { valid: false, error: '自定义提供商需要 Base URL' }
    }

    try {
      const chatModel = new ChatOpenAI({
        model: 'test',
        apiKey: apiKey || 'test',
        configuration: {
          baseURL: baseUrl,
        },
      })

      await chatModel.invoke(['Hello'])
      return { valid: true }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '验证失败'
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        return { valid: false, error: 'API Key 无效或 Base URL 不正确' }
      }
      return { valid: true }
    }
  }

  async fetchModels(
    type: ProviderType,
    apiKey?: string,
    baseUrl?: string
  ): Promise<{ models: string[]; error?: string }> {
    try {
      switch (type) {
        case 'openai':
          return await this.fetchOpenAIModels(apiKey)
        case 'anthropic':
          return await this.fetchAnthropicModels(apiKey)
        case 'local':
          return await this.fetchOllamaModels(baseUrl)
        case 'custom':
          return await this.fetchCustomModels(apiKey, baseUrl)
        default:
          return { models: [], error: '不支持的提供商类型' }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage }
    }
  }

  private async fetchOpenAIModels(apiKey?: string): Promise<{ models: string[]; error?: string }> {
    if (!apiKey) {
      return { models: [], error: '需要 API Key' }
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
        return { models: [], error: errorMessage }
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

      return { models }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage }
    }
  }

  private async fetchAnthropicModels(apiKey?: string): Promise<{ models: string[]; error?: string }> {
    return {
      models: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
      ],
    }
  }

  private async fetchOllamaModels(baseUrl?: string): Promise<{ models: string[]; error?: string }> {
    const url = baseUrl || 'http://localhost:11434'

    try {
      const response = await fetch(`${url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        return { models: [], error: `Ollama 服务响应错误: ${response.status}` }
      }

      const data = await response.json()
      const models = data.models?.map((model: any) => model.name) || []

      return { models }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage }
    }
  }

  private async fetchCustomModels(apiKey?: string, baseUrl?: string): Promise<{ models: string[]; error?: string }> {
    if (!baseUrl) {
      return { models: [], error: '需要 Base URL' }
    }

    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return { models: [], error: `请求失败: ${response.status}` }
      }

      const data = await response.json()
      const models = data.data?.map((model: any) => model.id) || []

      return { models }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取模型列表失败'
      return { models: [], error: errorMessage }
    }
  }
}