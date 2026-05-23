import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { Vendor, CreateVendorRequest, UpdateVendorRequest } from '@/src/types'
import { AppError } from '@/src/lib/errors'
import { createModel } from './vendor-protocol.service'

export class VendorService {
  private prisma: PrismaClient

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  async list(includeInactive = false): Promise<Vendor[]> {
    return this.prisma.vendor.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: 'desc' },
    }) as Promise<Vendor[]>
  }

  async get(id: string): Promise<Vendor | null> {
    return this.prisma.vendor.findUnique({
      where: { id },
    }) as Promise<Vendor | null>
  }

  async create(data: CreateVendorRequest): Promise<Vendor> {
    if (data.factoryCode) {
      this.validateCode(data.factoryCode)
    }
    if (data.isActive === undefined) throw new AppError('VENDOR_CREATE_IS_ACTIVE_REQUIRED')

    if (!(data as any).url) {
      throw new AppError('VENDOR_CREATE_URL_REQUIRED')
    }
    const vendor = await this.prisma.vendor.create({
      data: {
        name: data.name,
        url: (data as any).url,
        chatModelClass: data.chatModelClass,
        embeddingModelClass: data.embeddingModelClass,
        factoryCode: data.factoryCode,
        isActive: data.isActive,
      },
    })
    return vendor as Vendor
  }

  async update(id: string, data: UpdateVendorRequest): Promise<Vendor> {
    if (data.factoryCode) {
      this.validateCode(data.factoryCode)
    }
    const updateData: Record<string, unknown> = {
      ...(data.name && { name: data.name }),
      ...(data.chatModelClass && { chatModelClass: data.chatModelClass }),
      ...(data.embeddingModelClass && { embeddingModelClass: data.embeddingModelClass }),
      ...(data.factoryCode && { factoryCode: data.factoryCode }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    }
    return this.prisma.vendor.update({
      where: { id },
      data: updateData,
    }) as Promise<Vendor>
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vendor.delete({
      where: { id },
    })
  }

  async exists(name: string, excludeId?: string): Promise<boolean> {
    const count = await this.prisma.vendor.count({
      where: {
        name,
        ...(excludeId && { id: { not: excludeId } }),
      },
    })
    return count > 0
  }

  createModel(vendor: Vendor, params: {
    model: string
    modelType: 'chat' | 'embedding'
    apiKey?: string
    baseUrl?: string
    config?: Record<string, unknown>
  }) {
    return createModel(vendor, params)
  }

  private validateCode(code: string): void {
    if (!code.includes('module.exports')) {
      throw new AppError('VENDOR_FACTORY_CODE_INVALID_EXPORT')
    }
    if (!code.includes('createModel')) {
      throw new AppError('VENDOR_FACTORY_CODE_INVALID_METHOD')
    }
  }
}