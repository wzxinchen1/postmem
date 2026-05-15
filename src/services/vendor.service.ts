import type { PrismaClient } from '@prisma/client'
import type { Vendor, CreateVendorRequest, UpdateVendorRequest } from '@/src/types'
import { createChatModel } from './vendor-protocol.service'

/**
 * 厂商服务
 */
export class VendorService {
  private prisma: PrismaClient

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  /**
   * 获取所有厂商
   */
  async list(includeInactive = false): Promise<Vendor[]> {
    return this.prisma.vendor.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: 'desc' },
    }) as Promise<Vendor[]>
  }

  /**
   * 获取单个厂商
   */
  async get(id: number): Promise<Vendor | null> {
    return this.prisma.vendor.findUnique({
      where: { id },
    }) as Promise<Vendor | null>
  }

  /**
   * 创建厂商
   */
  async create(data: CreateVendorRequest): Promise<Vendor> {
    if (data.factoryCode) {
      this.validateCode(data.factoryCode)
    }
    const vendor = await this.prisma.vendor.create({
      data: {
        name: data.name,
        chatModelClass: data.chatModelClass,
        factoryCode: data.factoryCode,
        isActive: data.isActive ?? true,
      },
    })
    return vendor as Vendor
  }

  /**
   * 更新厂商
   */
  async update(id: number, data: UpdateVendorRequest): Promise<Vendor> {
    if (data.factoryCode) {
      this.validateCode(data.factoryCode)
    }
    const updateData: Record<string, unknown> = {
      ...(data.name && { name: data.name }),
      ...(data.chatModelClass && { chatModelClass: data.chatModelClass }),
      ...(data.factoryCode && { factoryCode: data.factoryCode }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    }
    return this.prisma.vendor.update({
      where: { id },
      data: updateData,
    }) as Promise<Vendor>
  }

  /**
   * 删除厂商
   */
  async delete(id: number): Promise<void> {
    await this.prisma.vendor.delete({
      where: { id },
    })
  }

  /**
   * 检查厂商名称是否存在
   */
  async exists(name: string, excludeId?: number): Promise<boolean> {
    const count = await this.prisma.vendor.count({
      where: {
        name,
        ...(excludeId && { id: { not: excludeId } }),
      },
    })
    return count > 0
  }

  /**
   * 创建 ChatModel 实例
   */
  createChatModel(vendor: Vendor, params: {
    model: string
    apiKey?: string
    baseUrl?: string
    config?: Record<string, unknown>
  }) {
    return createChatModel(vendor, params)
  }

  /**
   * 验证代码语法
   */
  private validateCode(code: string): void {
    // 简单验证：检查是否包含 module.exports
    if (!code.includes('module.exports')) {
      throw new Error('Factory code must export using module.exports')
    }
    if (!code.includes('createChatModel')) {
      throw new Error('Factory code must have createChatModel method')
    }
  }
}
