import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type {
  Model,
  CreateModelRequest,
  UpdateModelRequest,
  ModelCapability,
} from '@/src/types'
import { Errors } from '@/src/lib/errors'

/**
 * 模型服务
 */
export class ModelService {
  private prisma: PrismaClient

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  /**
   * 获取所有模型
   */
  async list(includeInactive = false): Promise<Model[]> {
    return this.prisma.model.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        provider: true,
      },
      orderBy: [
        { isDefault: 'desc' },
        { provider: { name: 'asc' } },
        { name: 'asc' },
      ],
    }) as Promise<Model[]>
  }

  /**
   * 获取指定提供商的模型
   */
  async listByProvider(providerId: string, includeInactive = false): Promise<Model[]> {
    return this.prisma.model.findMany({
      where: {
        providerId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    }) as Promise<Model[]>
  }

  /**
   * 获取单个模型
   */
  async get(id: string): Promise<Model | null> {
    return this.prisma.model.findUnique({
      where: { id },
      include: {
        provider: true,
      },
    }) as Promise<Model | null>
  }

  /**
   * 根据能力获取默认模型
   */
  async getDefaultByCapability(capability: ModelCapability): Promise<Model | null> {
    return this.prisma.model.findFirst({
      where: {
        isDefault: true,
        isActive: true,
        capabilities: { has: capability },
      },
      include: {
        provider: true,
      },
    }) as Promise<Model | null>
  }

  /**
   * 创建模型
   */
  async create(data: CreateModelRequest): Promise<Model> {
    if (data.isDefault) {
      const primaryCapability = this.getPrimaryCapability(data.capabilities)
      await this.prisma.model.updateMany({
        where: {
          capabilities: { has: primaryCapability },
          isDefault: true,
        },
        data: { isDefault: false },
      })
    }

    if (data.isActive === undefined) throw Errors.badRequest('创建模型时缺少 isActive 字段')
    if (data.isDefault === undefined) throw Errors.badRequest('创建模型时缺少 isDefault 字段')

    return this.prisma.model.create({
      data: {
        providerId: data.providerId,
        name: data.name,
        displayName: data.displayName,
        capabilities: data.capabilities,
        config: data.config ?? null,
        isActive: data.isActive,
        isDefault: data.isDefault,
      },
    }) as Promise<Model>
  }

  /**
   * 更新模型
   */
  async update(id: string, data: UpdateModelRequest): Promise<Model> {
    if (data.isDefault) {
      const model = await this.prisma.model.findUnique({
        where: { id },
      })
      if (model) {
        const capabilities = (data.capabilities ?? model.capabilities) as ModelCapability[]
        const primaryCapability = this.getPrimaryCapability(capabilities)
        await this.prisma.model.updateMany({
          where: {
            capabilities: { has: primaryCapability },
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        })
      }
    }

    return this.prisma.model.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.capabilities && { capabilities: data.capabilities }),
        ...(data.config && { config: data.config }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    }) as Promise<Model>
  }

  /**
   * 删除模型
   */
  async delete(id: string): Promise<void> {
    await this.prisma.model.delete({
      where: { id },
    })
  }

  /**
   * 检查模型名称是否存在
   */
  async exists(providerId: string, name: string, excludeId?: string): Promise<boolean> {
    const count = await this.prisma.model.count({
      where: {
        providerId,
        name,
        ...(excludeId && { id: { not: excludeId } }),
      },
    })
    return count > 0
  }

  private getPrimaryCapability(capabilities: ModelCapability[]): ModelCapability {
    if (capabilities.includes('chat')) return 'chat'
    if (capabilities.includes('reasoning')) return 'reasoning'
    if (capabilities.includes('vision')) return 'vision'
    if (capabilities.includes('embedding')) return 'embedding'
    throw Errors.badRequest('模型必须至少具备一种能力（chat/reasoning/vision/embedding）才能设为默认')
  }
}