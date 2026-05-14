import type { PrismaClient } from '@prisma/client'
import type {
  Provider,
  CreateProviderRequest,
  UpdateProviderRequest,
  VendorInfo,
} from '@/src/types'
import { VendorRegistryService } from './vendor-registry.service'

/**
 * 提供商服务
 */
export class ProviderService {
  private prisma: PrismaClient
  private vendorRegistry: VendorRegistryService

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
    this.vendorRegistry = new VendorRegistryService()
  }

  /**
   * 获取所有提供商
   */
  async list(includeInactive = false): Promise<Provider[]> {
    return this.prisma.provider.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
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
  async get(id: number): Promise<Provider | null> {
    return this.prisma.provider.findUnique({
      where: { id },
      include: {
        models: {
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        },
      },
    }) as Promise<Provider | null>
  }

  /**
   * 获取提供商的厂商信息
   */
  getVendorInfo(baseUrl: string): VendorInfo {
    return this.vendorRegistry.identify(baseUrl)
  }

  /**
   * 创建提供商
   */
  async create(data: CreateProviderRequest): Promise<Provider> {
    const provider = await this.prisma.provider.create({
      data: {
        name: data.name,
        apiKey: data.apiKey ?? null,
        baseUrl: data.baseUrl,
        config: (data.config ?? {}) as any,
        isActive: data.isActive ?? true,
      } as any,
    })
    return provider as Provider
  }

  /**
   * 更新提供商
   */
  async update(id: number, data: UpdateProviderRequest): Promise<Provider> {
    const updateData: Record<string, unknown> = {
      ...(data.name && { name: data.name }),
      ...(data.apiKey !== undefined && { apiKey: data.apiKey }),
      ...(data.baseUrl !== undefined && { baseUrl: data.baseUrl }),
      ...(data.config !== undefined && { config: data.config }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    }
    return this.prisma.provider.update({
      where: { id },
      data: updateData as any,
    }) as Promise<Provider>
  }

  /**
   * 删除提供商
   */
  async delete(id: number): Promise<void> {
    await this.prisma.provider.delete({
      where: { id },
    })
  }

  /**
   * 检查提供商名称是否存在
   */
  async exists(name: string, excludeId?: number): Promise<boolean> {
    const count = await this.prisma.provider.count({
      where: {
        name,
        ...(excludeId && { id: { not: excludeId } }),
      },
    })
    return count > 0
  }
}
