import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type {
  Model,
  CreateModelRequest,
  UpdateModelRequest,
} from '@/src/types'

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
   * 获取默认模型
   */
  async getDefault(modelType?: string): Promise<Model | null> {
    return this.prisma.model.findFirst({
      where: {
        isDefault: true,
        isActive: true,
        ...(modelType && { modelType }),
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
      await this.prisma.model.updateMany({
        where: {
          modelType: data.modelType,
          isDefault: true,
        },
        data: { isDefault: false },
      })
    }

    return this.prisma.model.create({
      data: {
        providerId: data.providerId,
        name: data.name,
        displayName: data.displayName,
        modelType: data.modelType,
        config: data.config || {},
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
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
        await this.prisma.model.updateMany({
          where: {
            modelType: model.modelType,
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
        ...(data.modelType && { modelType: data.modelType }),
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
}