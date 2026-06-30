import type { Embeddings } from '@langchain/core/embeddings'
import { AppError } from '@/src/lib/errors'
import { logger } from '@/src/lib/logger'
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
        capabilities: { has: 'embedding' },
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
      throw new AppError('EMBEDDING_DEFAULT_MODEL_NOT_CONFIGURED')
    }

    const result = { model: model as unknown as Model, provider: model.provider as unknown as Provider }
    this.modelCache.set(cacheKey, result)
    return result
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw new AppError('EMBEDDING_PROVIDER_MISSING_VENDOR')
    }

    const vendor = provider.vendor

    const embeddingModel = this.vendorService.createModel(vendor, {
      model: model.name,
      modelType: 'embedding',
      apiKey: provider.apiKey || undefined,
      baseUrl: provider.baseUrl || undefined,
      config: model.config,
    }) as Embeddings

    logger.info('[EmbeddingService] generateEmbedding 输入', { modelName: model.name, textLength: text.length, textPreview: text.slice(0, 200) })
    return embeddingModel.embedQuery(text)
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw new AppError('EMBEDDING_PROVIDER_MISSING_VENDOR')
    }

    const vendor = provider.vendor

    const embeddingModel = this.vendorService.createModel(vendor, {
      model: model.name,
      modelType: 'embedding',
      apiKey: provider.apiKey || undefined,
      baseUrl: provider.baseUrl || undefined,
      config: model.config,
    }) as Embeddings

    return Promise.all(texts.map((text) => embeddingModel.embedQuery(text)))
  }

  async healthCheck(): Promise<boolean> {
    return true
  }

  clearCache(): void {
    this.modelCache.clear()
  }
}
