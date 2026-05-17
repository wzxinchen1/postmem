import type { PrismaClient } from '@/src/generated/prisma/client/client'
import { ProviderValidateService } from './provider-validate.service'
import { ProviderService } from './provider.service'
import { ModelService } from './model.service'
import { VendorService } from './vendor.service'

interface Dependencies {
  prisma: PrismaClient
  providerValidateService: ProviderValidateService
  providerService: ProviderService
  modelService: ModelService
  vendorService: VendorService
}

interface InitProviderResult {
  name: string
  vendorName: string
  models: string[]
  error?: string
}

export class InitService {
  private prisma: PrismaClient
  private providerValidateService: ProviderValidateService
  private providerService: ProviderService
  private modelService: ModelService
  private vendorService: VendorService

  constructor({
    prisma,
    providerValidateService,
    providerService,
    modelService,
    vendorService,
  }: Dependencies) {
    this.prisma = prisma
    this.providerValidateService = providerValidateService
    this.providerService = providerService
    this.modelService = modelService
    this.vendorService = vendorService
  }

  async initDefaultProviders(): Promise<InitProviderResult[]> {
    const providers = await this.prisma.provider.findMany()
    const existingNames = new Set(providers.map((p) => p.name))

    const configs = [
      { name: 'Ollama 本地', vendorName: 'Ollama 本地', baseUrl: 'http://localhost:11434', apiKey: undefined },
      { name: 'DeepSeek', vendorName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY },
    ]

    const results: InitProviderResult[] = []

    for (const config of configs) {
      if (existingNames.has(config.name)) {
        const existing = providers.find((p) => p.name === config.name)
        if (!existing) {
          results.push({
            name: config.name,
            vendorName: config.vendorName,
            models: [],
            error: `提供商 "${config.name}" 查找失败`,
          })
          continue
        }
        const models = await this.prisma.model.findMany({
          where: { providerId: existing.id },
          select: { name: true },
        })
        results.push({
          name: config.name,
          vendorName: config.vendorName,
          models: models.map((m) => m.name),
        })
        continue
      }

      const vendor = await this.prisma.vendor.findFirst({
        where: { name: config.vendorName },
      })

      if (!vendor) {
        results.push({
          name: config.name,
          vendorName: config.vendorName,
          models: [],
          error: `厂商 "${config.vendorName}" 不存在，请先执行 seed`,
        })
        continue
      }

      const fetchResult = await this.providerValidateService.fetchModels(
        vendor.id,
        config.apiKey,
        config.baseUrl
      )

      if (fetchResult.error) {
        results.push({
          name: config.name,
          vendorName: config.vendorName,
          models: [],
          error: fetchResult.error,
        })
        continue
      }

      const provider = await this.providerService.create({
        name: config.name,
        vendorId: vendor.id,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      })

      const createdModels: string[] = []
      for (const modelName of fetchResult.models) {
        const modelType = this.inferModelType(modelName, vendor.chatModelClass, vendor.embeddingModelClass)
        const exists = await this.modelService.exists(provider.id, modelName)
        if (exists) continue

        await this.modelService.create({
          providerId: provider.id,
          name: modelName,
          modelType,
        })
        createdModels.push(modelName)
      }

      results.push({
        name: config.name,
        vendorName: config.vendorName,
        models: createdModels,
      })
    }

    return results
  }

  private inferModelType(modelName: string, chatModelClass: string | null, embeddingModelClass: string | null): 'chat' | 'embedding' {
    if (embeddingModelClass && /embed/i.test(modelName)) return 'embedding'
    if (chatModelClass && /embed/i.test(chatModelClass) && !/chat/i.test(chatModelClass)) return 'embedding'
    return 'chat'
  }
}