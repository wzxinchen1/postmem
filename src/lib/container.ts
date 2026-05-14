import { createContainer, asClass, asValue, InjectionMode } from 'awilix'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/src/lib/prisma'
import { EmbeddingService } from '@/src/services/embedding.service'
import { ChunkService } from '@/src/services/chunk.service'
import { KBService } from '@/src/services/kb.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { SettingService } from '@/src/services/setting.service'

/**
 * 依赖注入容器
 */
export const container = createContainer({
  injectionMode: InjectionMode.PROXY,
})

// 注册服务
container.register({
  // 单例服务
  prisma: asValue(prisma as PrismaClient),
  embeddingService: asClass(EmbeddingService).singleton(),
  settingService: asClass(SettingService).singleton(),
  
  // 瞬态服务
  chunkService: asClass(ChunkService).transient(),
  kbService: asClass(KBService).transient(),
  providerService: asClass(ProviderService).transient(),
  modelService: asClass(ModelService).transient(),
})

/**
 * 从容器解析服务
 */
export function resolve<T>(name: string): T {
  return container.resolve<T>(name)
}

export default container
