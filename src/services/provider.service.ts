import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type {
  Provider,
  ProviderTreeNode,
  CreateProviderRequest,
  UpdateProviderRequest,
  ModelCapability,
} from '@/src/types'
import { AppError } from '@/src/lib/errors'
import { VendorService } from './vendor.service'

/**
 * 提供商服务
 */
interface ProviderDependencies {
  prisma: PrismaClient
  vendorService: VendorService
}

export class ProviderService {
  private prisma: PrismaClient
  private vendorService: VendorService

  constructor({ prisma, vendorService }: ProviderDependencies) {
    this.prisma = prisma
    this.vendorService = vendorService
  }

  /**
   * 获取所有提供商
   */
  async list(includeInactive = false): Promise<Provider[]> {
    return this.prisma.provider.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        vendor: true,
        models: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    }) as Promise<Provider[]>
  }

  /**
   * 获取单个提供商
   */
  async get(id: string): Promise<Provider | null> {
    return this.prisma.provider.findUnique({
      where: { id },
      include: {
        vendor: true,
        models: {
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        },
      },
    }) as Promise<Provider | null>
  }

  /**
   * 创建 LangChain ChatModel 实例
   */
  async createModel(providerId: string, model: string, modelType: 'chat' | 'embedding', config?: Record<string, unknown>): Promise<unknown> {
    const provider = await this.get(providerId)
    if (!provider) {
      throw new AppError('PROVIDER_NOT_FOUND', { providerId })
    }

    if (!provider.vendor) {
      throw new AppError('PROVIDER_VENDOR_NOT_LINKED', { providerId })
    }

    return this.vendorService.createModel(provider.vendor, {
      model,
      modelType,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      config,
    })
  }

  /**
   * 创建提供商
   */
  async create(data: CreateProviderRequest): Promise<Provider> {
    if (data.isActive === undefined) throw new AppError('PROVIDER_CREATE_IS_ACTIVE_REQUIRED')

    const provider = await this.prisma.provider.create({
      data: {
        name: data.name,
        vendorId: data.vendorId,
        apiKey: data.apiKey ?? null,
        baseUrl: data.baseUrl,
        isActive: data.isActive,
      } as any,
      include: { vendor: true },
    })
    return provider as Provider
  }

  /**
   * 更新提供商
   */
  async update(id: string, data: UpdateProviderRequest): Promise<Provider> {
    const updateData: Record<string, unknown> = {
      ...(data.name && { name: data.name }),
      ...(data.vendorId !== undefined && { vendorId: data.vendorId }),
      ...(data.apiKey !== undefined && { apiKey: data.apiKey }),
      ...(data.baseUrl !== undefined && { baseUrl: data.baseUrl }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    }
    return this.prisma.provider.update({
      where: { id },
      data: updateData as any,
      include: { vendor: true },
    }) as Promise<Provider>
  }

  /**
   * 删除提供商
   */
  async delete(id: string): Promise<void> {
    await this.prisma.provider.delete({
      where: { id },
    })
  }

  /**
   * 获取提供商-模型树形结构
   */
  async getTree(includeInactive = false): Promise<ProviderTreeNode[]> {
    const providers = await this.prisma.provider.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        vendor: true,
        models: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      vendorName: provider.vendor.name,
      baseUrl: provider.baseUrl,
      isActive: provider.isActive,
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        displayName: model.displayName ?? '',
        capabilities: model.capabilities as ModelCapability[],
        isDefault: model.isDefault,
        isActive: model.isActive,
      })),
    }))
  }

  /**
   * 检查提供商名称是否存在
   */
  async exists(name: string, excludeId?: string): Promise<boolean> {
    const count = await this.prisma.provider.count({
      where: {
        name,
        ...(excludeId && { id: { not: excludeId } }),
      },
    })
    return count > 0
  }
}