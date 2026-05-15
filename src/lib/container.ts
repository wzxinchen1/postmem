import { createContainer, asClass, asValue, InjectionMode } from 'awilix'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/src/lib/prisma'
import { EmbeddingService } from '@/src/services/embedding.service'
import { CutModelService } from '@/src/services/cut-model.service'
import { KBService } from '@/src/services/kb.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { SettingService } from '@/src/services/setting.service'
import { SessionService } from '@/src/services/session.service'
import { ProviderValidateService } from '@/src/services/provider-validate.service'
import { VendorService } from '@/src/services/vendor.service'

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
  cutModelService: asClass(CutModelService).scoped(),
  kbService: asClass(KBService).scoped(),
  providerService: asClass(ProviderService).scoped(),
  modelService: asClass(ModelService).scoped(),
  providerValidateService: asClass(ProviderValidateService).scoped(),
  vendorService: asClass(VendorService).scoped(),
})

export default container
