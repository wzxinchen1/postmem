import type { Embeddings } from '@langchain/core/embeddings'
import { Errors } from '@/src/lib/errors'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { Model, Provider } from '@/src/types'
import { VendorService } from './vendor.service'

interface Dependencies {
  prisma: PrismaClient
  vendorService: VendorService
}

export class EmbeddingService {
  private prisma: PrismaClient
  private vendorService: VendorService
  private modelCache: Map<string, { model: Model; provider: Provider }> = new Map()

  constructor({ prisma, vendorService }: Dependencies) {
    this.prisma = prisma
    this.vendorService = vendorService
  }

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
        provider: {
          include: {
            vendor: true,
          },
        },
      },
    })

    if (!model || !model.provider || !model.provider.vendor) {
      throw Errors.embeddingError('未配置默认嵌入模型，请在 /admin/models 页面配置')
    }

    const result = { model: model as unknown as Model, provider: model.provider as unknown as Provider }
    this.modelCache.set(cacheKey, result)
    return result
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.embeddingError('提供商缺少厂商信息')
    }

    const vendor = provider.vendor

    const embeddingModel = this.vendorService.createModel(vendor, {
      model: model.name,
      modelType: 'embedding',
      apiKey: provider.apiKey || undefined,
      baseUrl: provider.baseUrl || undefined,
      config: model.config,
    }) as Embeddings

    return embeddingModel.embedQuery(text)
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = []
    for (const text of texts) {
      const embedding = await this.generateEmbedding(text)
      embeddings.push(embedding)
    }
    return embeddings
  }

  async healthCheck(): Promise<boolean> {
    const { provider } = await this.getDefaultModel()

    if (provider.baseUrl.includes('localhost:11434')) {
      const response = await fetch(`${provider.baseUrl}/api/tags`, {
        method: 'GET',
      })
      return response.ok
    }

    return true
  }

  clearCache(): void {
    this.modelCache.clear()
  }
}
