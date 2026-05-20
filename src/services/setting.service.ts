import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { Setting, AppSettings } from '@/src/types'

/**
 * 应用设置服务
 */
export class SettingService {
  private prisma: PrismaClient
  private cache: Map<string, unknown> = new Map()

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  /**
   * 获取设置值
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T
    }

    const setting = await this.prisma.setting.findUnique({
      where: { key },
    })

    if (!setting) {
      return null
    }

    this.cache.set(key, setting.value)
    return setting.value as T
  }

  /**
   * 设置值
   */
  async set(key: string, value: Record<string, unknown>, description?: string): Promise<Setting> {
    const setting = await this.prisma.setting.upsert({
      where: { key },
      update: { value: value as any, description },
      create: { key, value: value as any, description },
    })

    this.cache.set(key, value)
    return setting as Setting
  }

  /**
   * 获取所有应用设置
   */
  async getAppSettings(): Promise<AppSettings> {
    const defaults: AppSettings = {
      maxContentLength: 20000,
      defaultTopK: 5,
      defaultContextWindow: 1,
      defaultPageSize: 20,
    }

    const settings = await this.prisma.setting.findMany({
      where: {
        key: { in: Object.keys(defaults) },
      },
    })

    const result = { ...defaults }
    for (const setting of settings) {
      const key = setting.key as keyof AppSettings
      result[key] = (setting.value as any)[key] as any
    }

    return result
  }

  /**
   * 更新应用设置
   */
  async updateAppSettings(data: Partial<AppSettings>): Promise<AppSettings> {
    const updates = []
    for (const [key, value] of Object.entries(data)) {
      updates.push(
        this.prisma.setting.upsert({
          where: { key },
          update: { value: { [key]: value } as any },
          create: { key, value: { [key]: value } as any },
        })
      )
    }

    await Promise.all(updates)

    this.cache.clear()

    return this.getAppSettings()
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear()
  }
}
