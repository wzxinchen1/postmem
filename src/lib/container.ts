import { createContainer, asClass, asValue, InjectionMode } from 'awilix'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import prisma from '@/src/lib/prisma'
import { EmbeddingService } from '@/src/services/embedding.service'
import { CutModelService } from '@/src/services/cut-model.service'
import { KBService } from '@/src/services/kb.service'
import { ProviderService } from '@/src/services/provider.service'
import { ModelService } from '@/src/services/model.service'
import { SettingService } from '@/src/services/setting.service'
import { ConversationService } from '@/src/services/conversation.service'
import { SessionService } from '@/src/services/session.service'
import { ProviderValidateService } from '@/src/services/provider-validate.service'
import { VendorService } from '@/src/services/vendor.service'
import { ChatService } from '@/src/services/chat.service'
import { SSEService } from '@/src/services/sse.service'
import { SearchService } from '@/src/services/chat-search.service'
import { ChatMemoryService } from '@/src/services/chat-memory.service'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { ChatModelFactory } from '@/src/services/chat-model-factory.service'
import { InitService } from '@/src/services/init.service'
import { LLMResilienceService } from '@/src/services/llm-resilience.service'

export const container = createContainer({
  injectionMode: InjectionMode.PROXY,
})

container.register({
  prisma: asValue(prisma as PrismaClient),
  embeddingService: asClass(EmbeddingService).scoped(),
  settingService: asClass(SettingService).scoped(),
  conversationService: asClass(ConversationService).scoped(),
  sessionService: asClass(SessionService).scoped(),
  cutModelService: asClass(CutModelService).scoped(),
  kbService: asClass(KBService).scoped(),
  providerService: asClass(ProviderService).scoped(),
  modelService: asClass(ModelService).scoped(),
  providerValidateService: asClass(ProviderValidateService).scoped(),
  vendorService: asClass(VendorService).scoped(),
  sseService: asClass(SSEService).scoped(),
  searchService: asClass(SearchService).scoped(),
  chatMemoryService: asClass(ChatMemoryService).scoped(),
  chatSettingService: asClass(ChatSettingService).scoped(),
  chatModelFactory: asClass(ChatModelFactory).scoped(),
  chatService: asClass(ChatService).scoped(),
  initService: asClass(InitService).scoped(),
  llmResilienceService: asClass(LLMResilienceService).scoped(),
})

export default container