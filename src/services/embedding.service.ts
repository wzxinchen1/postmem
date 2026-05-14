import { Errors } from '@/src/lib/errors'
import type { PrismaClient } from '@prisma/client'
import type { Model, Provider } from '@/src/types'

/**
 * 嵌入服务 - 从数据库配置动态使用模型
 */
export class EmbeddingService {
  private prisma: PrismaClient
  private modelCache: Map<string, { model: Model; provider: Provider }> = new Map()

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  /**
   * 获取默认嵌入模型配置
   */
  private async getDefaultModel(): Promise<{ model: Model; provider: Provider }> {
    // 检查缓存
    const cacheKey = 'default_embedding'
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!
    }

    const model = await this.prisma.model.findFirst({
      where: {
        modelType: 'embedding',
        isDefault: true,
        isActive: true,
      },
      include: {
        provider: true,
      },
    })

    if (!model || !model.provider) {
      throw Errors.embeddingError('No default embedding model configured. Please configure one in /admin/models')
    }

    // 缓存结果
    const result = { model, provider: model.provider }
    this.modelCache.set(cacheKey, result)
    return result
  }

  /**
   * 生成文本的嵌入向量
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const { model, provider } = await this.getDefaultModel()

    // 根据提供商类型调用不同的 API
    switch (provider.type) {
      case 'local':
        return await this.generateWithOllama(text, model.name, provider.baseUrl || 'http://localhost:11434')
      case 'openai':
        return await this.generateWithOpenAI(text, model.name, provider.apiKey!)
      case 'anthropic':
        throw Errors.embeddingError('Anthropic does not support embedding models')
      case 'custom':
        return await this.generateWithCustom(text, model.name, provider.baseUrl!, provider.apiKey)
      default:
        throw Errors.embeddingError(`Unknown provider type: ${provider.type}`)
    }
  }

  /**
   * 使用 Ollama 生成嵌入
   */
  private async generateWithOllama(text: string, modelName: string, baseUrl: string): Promise<number[]> {
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt: text,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw Errors.embeddingError(`Ollama API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw Errors.embeddingError('Invalid embedding response from Ollama')
    }

    return data.embedding as number[]
  }

  /**
   * 使用 OpenAI 生成嵌入
   */
  private async generateWithOpenAI(text: string, modelName: string, apiKey: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        input: text,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw Errors.embeddingError(`OpenAI API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    if (!data.data || !data.data[0]?.embedding) {
      throw Errors.embeddingError('Invalid embedding response from OpenAI')
    }

    return data.data[0].embedding as number[]
  }

  /**
   * 使用自定义端点生成嵌入
   */
  private async generateWithCustom(text: string, modelName: string, baseUrl: string, apiKey?: string | null): Promise<number[]> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        input: text,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw Errors.embeddingError(`Custom API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    // 尝试解析不同格式的响应
    if (data.embedding && Array.isArray(data.embedding)) {
      return data.embedding
    }
    
    if (data.data && data.data[0]?.embedding) {
      return data.data[0].embedding
    }

    throw Errors.embeddingError('Invalid embedding response from custom endpoint')
  }

  /**
   * 批量生成嵌入向量
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = []
    for (const text of texts) {
      const embedding = await this.generateEmbedding(text)
      embeddings.push(embedding)
    }
    return embeddings
  }

  /**
   * 检查服务是否可用
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { provider } = await this.getDefaultModel()
      
      if (provider.type === 'local') {
        const response = await fetch(`${provider.baseUrl || 'http://localhost:11434'}/api/tags`, {
          method: 'GET',
        })
        return response.ok
      }
      
      return true // 其他类型假设可用
    } catch {
      return false
    }
  }

  /**
   * 清除模型缓存
   */
  clearCache(): void {
    this.modelCache.clear()
  }
}