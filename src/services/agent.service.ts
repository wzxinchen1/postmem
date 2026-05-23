import type { Model, Vendor } from '@/src/types'
import { ChatModelFactory } from '@/src/services/chat-model-factory.service'
import { ModelService } from '@/src/services/model.service'
import { ProviderService } from '@/src/services/provider.service'
import type { IChatSettingProvider } from '@/src/interfaces/chat-setting-provider'
import { AppError } from '@/src/lib/errors'
import { logger } from '@/src/lib/logger'

interface Dependencies {
  chatModelFactory: ChatModelFactory
  modelService: ModelService
  providerService: ProviderService
  chatSettingService: IChatSettingProvider
}

export class AgentService {
  private chatModelFactory: ChatModelFactory
  private modelService: ModelService
  private providerService: ProviderService
  private chatSettingService: IChatSettingProvider

  constructor({ chatModelFactory, modelService, providerService, chatSettingService }: Dependencies) {
    this.chatModelFactory = chatModelFactory
    this.modelService = modelService
    this.providerService = providerService
    this.chatSettingService = chatSettingService
  }

  async getChatAgent(modelId: string, thinkingEffort?: string): Promise<unknown> {
    const model = await this.modelService.get(modelId)
    if (!model) {
      throw new AppError('MODEL_NOT_FOUND', { modelId })
    }

    const { vendor, apiKey, baseUrl } = await this.resolveProvider(model)
    const chatSetting = await this.chatSettingService.get()
    const hasReasoning = thinkingEffort !== undefined && thinkingEffort !== 'none'

    logger.info('[AgentService] 创建聊天 agent', {
      modelId,
      modelName: model.name,
      thinkingEffort,
      hasReasoning,
    })

    return this.chatModelFactory.createAgent(vendor, {
      model: model.name,
      apiKey,
      baseUrl,
      maxTokens: chatSetting.maxOutputTokens,
      reasoning: !!hasReasoning,
      reasoningEffort: hasReasoning ? thinkingEffort : undefined,
      config: { capabilities: model.capabilities },
    })
  }

  async getVisionAgent(): Promise<unknown> {
    const visionModel = await this.modelService.getDefaultByCapability('vision')
    if (!visionModel) {
      throw new AppError('AGENT_VISION_MODEL_NOT_CONFIGURED')
    }

    const { vendor, apiKey, baseUrl } = await this.resolveProvider(visionModel)

    logger.info('[AgentService] 创建识图 agent', { modelName: visionModel.name })

    return this.chatModelFactory.createAgent(vendor, {
      model: visionModel.name,
      apiKey,
      baseUrl,
      config: { capabilities: visionModel.capabilities, reasoning: false },
    })
  }

  async getDefaultChatAgent(): Promise<unknown> {
    const defaultModel = await this.modelService.getDefaultByCapability('chat')
    if (!defaultModel) {
      throw new AppError('AGENT_CHAT_MODEL_NOT_CONFIGURED')
    }

    const { vendor, apiKey, baseUrl } = await this.resolveProvider(defaultModel)
    const chatSetting = await this.chatSettingService.get()

    logger.info('[AgentService] 创建默认聊天 agent', { modelName: defaultModel.name })

    return this.chatModelFactory.createAgent(vendor, {
      model: defaultModel.name,
      apiKey,
      baseUrl,
      maxTokens: chatSetting.maxOutputTokens,
      config: { capabilities: defaultModel.capabilities },
    })
  }

  private async resolveProvider(model: Model): Promise<{ vendor: Vendor; apiKey: string; baseUrl: string }> {
    const provider = await this.providerService.get(model.providerId)
    if (!provider) {
      throw new AppError('AGENT_MODEL_PROVIDER_NOT_FOUND', { modelName: model.name })
    }
    if (!provider.vendor) {
      throw new AppError('AGENT_PROVIDER_VENDOR_NOT_LINKED', { providerId: provider.id })
    }
    if (!provider.apiKey) {
      throw new AppError('AGENT_PROVIDER_MISSING_API_KEY', { providerId: provider.id })
    }
    if (!provider.baseUrl) {
      throw new AppError('AGENT_PROVIDER_MISSING_BASE_URL', { providerId: provider.id })
    }

    return {
      vendor: provider.vendor,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
    }
  }
}
