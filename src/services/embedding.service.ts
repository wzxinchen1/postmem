import { Errors } from '@/src/lib/errors'
import type { PrismaClient } from '@prisma/client'
import type { Model, Provider } from '@/src/types'
import { SessionService } from '@/src/services/session.service'

/**
 * 嵌入服务 - 从数据库配置动态使用模型
 */
export class EmbeddingService {
  private prisma: PrismaClient
  private sessionService: SessionService
  private modelCache: Map<string, { model: Model; provider: Provider }> = new Map()

  constructor({ prisma, sessionService }: { prisma: PrismaClient; sessionService: SessionService }) {
    this.prisma = prisma
    this.sessionService = sessionService
  }

  /**
   * 获取默认嵌入模型配置
   */
  private async getDefaultModel(): Promise<{ model: Model; provider: Provider }> {
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
      throw Errors.embeddingError('未配置默认嵌入模型，请在 /admin/models 页面配置')
    }

    const result = { model, provider: model.provider }
    this.modelCache.set(cacheKey, result)
    return result
  }

  /**
   * 生成文本的嵌入向量
   */
  async generateEmbedding(text: string, kbId?: number): Promise<number[]> {
    const { model, provider } = await this.getDefaultModel()

    const session = await this.sessionService.create({
      kbId,
      modelType: 'embedding',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        providerType: provider.type,
      },
    })

    let result: number[]
    
    switch (provider.type) {
      case 'local':
        result = await this.generateWithOllama(text, model.name, provider.baseUrl || 'http://localhost:11434', session.id)
        break
      case 'openai':
        result = await this.generateWithOpenAI(text, model.name, provider.apiKey!, session.id)
        break
      case 'anthropic':
        throw Errors.embeddingError('Anthropic 不支持嵌入模型')
      case 'custom':
        result = await this.generateWithCustom(text, model.name, provider.baseUrl!, provider.apiKey, session.id)
        break
      default:
        throw Errors.embeddingError(`未知的提供商类型: ${provider.type}`)
    }

    await this.sessionService.complete(session.id)
    return result
  }

  /**
   * 使用 Ollama 生成嵌入
   */
  private async generateWithOllama(text: string, modelName: string, baseUrl: string, sessionId: number): Promise<number[]> {
    await this.sessionService.addMessage({
      sessionId,
      role: 'user',
      content: text.substring(0, 500),
      metadata: { textLength: text.length },
    })

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
      throw Errors.embeddingError(`Ollama API 错误: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw Errors.embeddingError('Ollama 返回的嵌入响应无效')
    }

    await this.sessionService.addMessage({
      sessionId,
      role: 'assistant',
      content: `[embedding vector: ${data.embedding.length} dimensions]`,
      metadata: { model: modelName, dimensions: data.embedding.length },
    })

    return data.embedding as number[]
  }

  /**
   * 使用 OpenAI 生成嵌入
   */
  private async generateWithOpenAI(text: string, modelName: string, apiKey: string, sessionId: number): Promise<number[]> {
    await this.sessionService.addMessage({
      sessionId,
      role: 'user',
      content: text.substring(0, 500),
      metadata: { textLength: text.length },
    })

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
      throw Errors.embeddingError(`OpenAI API 错误: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    if (!data.data || !data.data[0]?.embedding) {
      throw Errors.embeddingError('OpenAI 返回的嵌入响应无效')
    }

    await this.sessionService.addMessage({
      sessionId,
      role: 'assistant',
      content: `[embedding vector: ${data.data[0].embedding.length} dimensions]`,
      tokens: data.usage?.total_tokens,
      metadata: { model: modelName, dimensions: data.data[0].embedding.length },
    })

    return data.data[0].embedding as number[]
  }

  /**
   * 使用自定义端点生成嵌入
   */
  private async generateWithCustom(text: string, modelName: string, baseUrl: string, apiKey: string | null | undefined, sessionId: number): Promise<number[]> {
    await this.sessionService.addMessage({
      sessionId,
      role: 'user',
      content: text.substring(0, 500),
      metadata: { textLength: text.length },
    })

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
      throw Errors.embeddingError(`自定义 API 错误: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    let embedding: number[]
    
    if (data.embedding && Array.isArray(data.embedding)) {
      embedding = data.embedding
    } else if (data.data && data.data[0]?.embedding) {
      embedding = data.data[0].embedding
    } else {
      throw Errors.embeddingError('自定义端点返回的嵌入响应无效')
    }

    await this.sessionService.addMessage({
      sessionId,
      role: 'assistant',
      content: `[embedding vector: ${embedding.length} dimensions]`,
      tokens: data.usage?.total_tokens,
      metadata: { model: modelName, dimensions: embedding.length },
    })

    return embedding
  }

  /**
   * 批量生成嵌入向量
   */
  async generateEmbeddings(texts: string[], kbId?: number): Promise<number[][]> {
    const embeddings: number[][] = []
    for (const text of texts) {
      const embedding = await this.generateEmbedding(text, kbId)
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
      
      return true
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
