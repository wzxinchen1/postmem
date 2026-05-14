import { createContainer, asClass, asValue, InjectionMode } from 'awilix'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/src/lib/prisma'
import { EmbeddingService } from '@/src/services/embedding.service'
import { ChunkService } from '@/src/services/chunk.service'
import { KBService } from '@/src/services/kb.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { SettingService } from '@/src/services/setting.service'
import { SessionService } from '@/src/services/session.service'

/**
 * 依赖注入容器
 */
export const container = createContainer({
  injectionMode: InjectionMode.PROXY,
})

container.register({
  prisma: asValue(prisma as PrismaClient),
  embeddingService: asClass(EmbeddingService).scoped(),
  settingService: asClass(SettingService).scoped(),
  sessionService: asClass(SessionService).scoped(),
  chunkService: asClass(ChunkService).scoped(),
  kbService: asClass(KBService).scoped(),
  providerService: asClass(ProviderService).scoped(),
  modelService: asClass(ModelService).scoped(),
})

export default container
