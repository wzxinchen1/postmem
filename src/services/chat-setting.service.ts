import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { ChatSettingInfo } from '@/src/types'

export class ChatSettingService {
  private prisma: PrismaClient

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma
  }

  async get(): Promise<ChatSettingInfo> {
    const setting = await this.prisma.chatSetting.findFirst()
    if (!setting) {
      return this.prisma.chatSetting.create({
        data: {
          memoryContextThreshold: 50,
          searchLinkCount: 10,
        },
      }) as Promise<ChatSettingInfo>
    }
    return setting as ChatSettingInfo
  }

  async update(data: { memoryContextThreshold?: number; maxOutputTokens?: number | null; searchLinkCount?: number; chunkCharRange?: string }): Promise<ChatSettingInfo> {
    const setting = await this.get()
    return this.prisma.chatSetting.update({
      where: { id: setting.id },
      data,
    }) as Promise<ChatSettingInfo>
  }
}