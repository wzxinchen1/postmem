import type { Model, Vendor } from '@/src/types'
import { ChatModelFactory } from '@/src/services/chat-model-factory.service'
import { ModelService } from '@/src/services/model.service'
import { ProviderService } from '@/src/services/provider.service'
import { ChatSettingService } from '@/src/services/chat-setting.service'
import { Errors } from '@/src/lib/errors'
import { logger } from '@/src/lib/logger'

interface Dependencies {
  chatModelFactory: ChatModelFactory
  modelService: ModelService
  providerService: ProviderService
  chatSettingService: ChatSettingService
}

export class AgentService {
  private chatModelFactory: ChatModelFactory
  private modelService: ModelService
  private providerService: ProviderService
  private chatSettingService: ChatSettingService

  constructor({ chatModelFactory, modelService, providerService, chatSettingService }: Dependencies) {
    this.chatModelFactory = chatModelFactory
    this.modelService = modelService
    this.providerService = providerService
    this.chatSettingService = chatSettingService
  }

  async getChatAgent(modelId: string, thinkingEffort?: string): Promise<unknown> {
    const model = await this.modelService.get(modelId)
    if (!model) {
      throw Errors.internalError(`模型 ${modelId} 不存在`)
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
      throw Errors.internalError('系统中没有配置识图模型（vision capability）')
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
      throw Errors.internalError('系统中没有配置默认聊天模型')
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
      throw Errors.internalError(`模型 ${model.name} 对应的提供商不存在`)
    }
    if (!provider.vendor) {
      throw Errors.internalError(`提供商 ${provider.id} 未关联厂商`)
    }
    if (!provider.apiKey) {
      throw Errors.internalError(`提供商 ${provider.id} 缺少 apiKey`)
    }
    if (!provider.baseUrl) {
      throw Errors.internalError(`提供商 ${provider.id} 缺少 baseUrl`)
    }

    return {
      vendor: provider.vendor,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
    }
  }
}
