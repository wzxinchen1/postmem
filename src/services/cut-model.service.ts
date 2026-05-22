import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Errors } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import { logger } from '@/src/lib/logger'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { Model, Provider, CutPoint, IngestMessage, MessageGroup, ModelCapability, TopicMatchResult, TopicCreateInfo, BatchTopicPlan, TitledChunk } from '@/src/types'
import { SessionService } from '@/src/services/session.service'
import { VendorService } from './vendor.service'
import { LLMResilienceService } from '@/src/services/llm-resilience.service'
import type { IChatSettingProvider } from '@/src/interfaces/chat-setting-provider'

interface CutModelDependencies {
  prisma: PrismaClient
  sessionService: SessionService
  vendorService: VendorService
  llmResilienceService: LLMResilienceService
  chatSettingService: IChatSettingProvider
}

export class CutModelService {
  private prisma: PrismaClient
  private sessionService: SessionService
  private vendorService: VendorService
  private llmResilienceService: LLMResilienceService
  private chatSettingService: IChatSettingProvider
  private modelCache: Map<string, { model: Model; provider: Provider }> = new Map<string, { model: Model; provider: Provider }>()

  private static readonly MAX_RETRIES = 5

  constructor({ prisma, sessionService, vendorService, llmResilienceService, chatSettingService }: CutModelDependencies) {
    this.prisma = prisma
    this.sessionService = sessionService
    this.vendorService = vendorService
    this.llmResilienceService = llmResilienceService
    this.chatSettingService = chatSettingService
  }

  private async getDefaultModel(): Promise<{ model: Model; provider: Provider }> {
    const cacheKey = 'default_chat'
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!
    }

    const model = await this.prisma.model.findFirst({
      where: {
        capabilities: { has: 'chat' },
        isDefault: true,
        isActive: true,
      },
      include: {
        provider: {
          include: {
            vendor: true,
          },
        },
      },
    })

    if (!model || !model.provider || !model.provider.vendor) {
      throw Errors.internalError('未配置默认对话模型，请在 /admin/models 页面配置')
    }

    const result: { model: Model; provider: Provider } = {
      model: {
        id: model.id,
        providerId: model.providerId,
        name: model.name,
        displayName: model.displayName ?? undefined,
        capabilities: model.capabilities as ModelCapability[],
        config: model.config as Record<string, unknown>,
        isActive: model.isActive,
        isDefault: model.isDefault,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      },
      provider: {
        id: model.provider.id,
        name: model.provider.name,
        vendorId: model.provider.vendorId,
        vendor: {
          id: model.provider.vendor.id,
          name: model.provider.vendor.name,
          url: model.provider.vendor.url,
          chatModelClass: model.provider.vendor.chatModelClass,
          embeddingModelClass: model.provider.vendor.embeddingModelClass,
          factoryCode: model.provider.vendor.factoryCode,
          isActive: model.provider.vendor.isActive,
          createdAt: model.provider.vendor.createdAt,
          updatedAt: model.provider.vendor.updatedAt,
        },
        apiKey: model.provider.apiKey ?? undefined,
        baseUrl: model.provider.baseUrl ?? undefined,
        isActive: model.provider.isActive,
        createdAt: model.provider.createdAt,
        updatedAt: model.provider.updatedAt,
      } as any,
    }
    this.modelCache.set(cacheKey, result)
    return result
  }

  private async createModel(model: Model, provider: Provider): Promise<BaseChatModel> {
    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    return this.vendorService.createModel(provider.vendor, {
      model: model.name,
      modelType: 'chat',
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      config: {
        ...model.config,
        reasoning: true,
        reasoningEffort: 'max',
      },
    }) as BaseChatModel
  }

  private async callLLM(
    prompt: string,
    systemPrompt: string,
    model: Model,
    provider: Provider,
    sessionId: string
  ): Promise<string> {
    const chatModel = await this.createModel(model, provider)

    await this.sessionService.addMessage({
      sessionId,
      role: 'system',
      content: systemPrompt,
    })

    await this.sessionService.addMessage({
      sessionId,
      role: 'user',
      content: prompt,
    })

    logger.info('[CutModelService] callLLM', {
      model: model.name,
      provider: provider.name,
      sessionId,
    })
    const response = await chatModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt),
    ])
    logger.info('[CutModelService] callLLM responsed')
    const content = response.content.toString()

    const messageMetadata: Record<string, unknown> = { model: model.name }

    if (response.additional_kwargs == null) {
      throw Errors.internalError(`LLM SDK 返回的 additional_kwargs 为 null，可能是 SDK 版本不兼容`)
    }

    const additionalKwargs = response.additional_kwargs
    if (additionalKwargs.reasoning_content) {
      messageMetadata.reasoning_content = additionalKwargs.reasoning_content
    }

    await this.sessionService.addMessage({
      sessionId,
      role: 'assistant',
      content,
      metadata: messageMetadata,
    })

    return content
  }

  /**
   * LLM 调用 + JSON 解析 + 格式校验，带自动重试
   * 校验不通过或调用异常时自动重试，超过 MAX_RETRIES 次后抛出错误
   */
  private async callLLMAndValidate<T>(
    prompt: string,
    systemPrompt: string,
    model: Model,
    provider: Provider,
    sessionId: string,
    validator: (parsed: unknown) => T
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= CutModelService.MAX_RETRIES; attempt++) {
      let content: string
      try {
        content = await this.callLLM(prompt, systemPrompt, model, provider, sessionId)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        logger.error('[CutModelService] LLM 调用失败，准备重试', {
          attempt,
          maxRetries: CutModelService.MAX_RETRIES,
          errorMessage: lastError.message,
          stack: lastError.stack,
        })
        continue
      }

      try {
        const parsed = this.llmResilienceService.parseJSON<unknown>(content)
        return validator(parsed)
      } catch (parseError) {
        lastError = parseError instanceof Error ? parseError : new Error(String(parseError))

        logger.error('[CutModelService] 解析/校验失败，准备重试', {
          attempt,
          maxRetries: CutModelService.MAX_RETRIES,
          errorMessage: lastError.message,
          stack: lastError.stack,
        })
      }
    }

    throw Errors.internalError(
      `LLM 调用失败，已重试 ${CutModelService.MAX_RETRIES} 次`,
      lastError ?? new Error('未知错误')
    )
  }

  async analyzeCutPoints(text: string, kbId?: string): Promise<CutPoint[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: provider.vendor.id,
        vendorName: provider.vendor.name,
      },
    })

    const systemPrompt = Prompts.textAnalysisExpert()
    const prompt = Prompts.cutPoints(text)

    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, session.id, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw Errors.internalError('响应格式无效: 缺少 cutPoints 数组')
      }
      const obj = raw as { cutPoints?: unknown }
      if (!obj.cutPoints || !Array.isArray(obj.cutPoints)) {
        throw Errors.internalError('响应格式无效: 缺少 cutPoints 数组')
      }
      return obj as { cutPoints: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.cutPoints.map((point: any) => ({
      index: Number(point.index),
      reason: point.reason,
    }))
  }

  async analyzeMessageGroups(messages: IngestMessage[], kbId?: string): Promise<MessageGroup[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: provider.vendor.id,
        vendorName: provider.vendor.name,
      },
    })

    const systemPrompt = Prompts.conversationAnalysisExpert()
    const prompt = Prompts.messageAnalysis(messages)

    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, session.id, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw Errors.internalError('响应格式无效: 缺少 groups 数组')
      }
      const obj = raw as { groups?: unknown }
      if (!obj.groups || !Array.isArray(obj.groups)) {
        throw Errors.internalError('响应格式无效: 缺少 groups 数组')
      }
      return obj as { groups: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.groups.map((group: any) => {
      if (group.messageIds == null) {
        throw Errors.internalError('LLM 返回的 group 缺少 messageIds 字段')
      }
      if (!Array.isArray(group.messageIds)) {
        throw Errors.internalError(`LLM 返回的 messageIds 不是数组，实际类型: ${typeof group.messageIds}`)
      }
      return {
        messageIds: group.messageIds,
        summary: group.summary,
        isComplete: group.isComplete !== false,
      }
    })
  }

  async analyzeTextGroups(text: string, kbId?: string): Promise<MessageGroup[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: provider.vendor.id,
        vendorName: provider.vendor.name,
      },
    })

    const systemPrompt = Prompts.textAnalysisExpert()
    const prompt = Prompts.textAnalysis(text)

    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, session.id, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw Errors.internalError('响应格式无效: 缺少 groups 数组')
      }
      const obj = raw as { groups?: unknown }
      if (!obj.groups || !Array.isArray(obj.groups)) {
        throw Errors.internalError('响应格式无效: 缺少 groups 数组')
      }
      return obj as { groups: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.groups.map((group: any) => ({
      messageIds: [],
      summary: group.summary,
      isComplete: group.isComplete !== false,
    }))
  }

  async cutAndRewrite(text: string, kbId?: string): Promise<TitledChunk[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: provider.vendor.id,
        vendorName: provider.vendor.name,
        task: 'cut-and-rewrite',
      },
    })

    const chatSetting = await this.chatSettingService.get()
    const charRange = chatSetting.chunkCharRange
    const systemPrompt = Prompts.cutAndRewriteExpert()
    const prompt = Prompts.cutAndRewrite(text, charRange)

    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, session.id, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw Errors.internalError('响应格式无效: 缺少 chunks 数组或数组为空')
      }
      const obj = raw as { chunks?: unknown }
      if (!obj.chunks || !Array.isArray(obj.chunks) || (obj.chunks as any[]).length === 0) {
        throw Errors.internalError('响应格式无效: 缺少 chunks 数组或数组为空')
      }
      return obj as { chunks: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.chunks.map((chunk: any, i: number) => {
      if (!chunk.title || !chunk.title.trim()) {
        throw Errors.internalError(`LLM 返回的 chunk #${i} 缺少 title`)
      }
      if (!chunk.content || !chunk.content.trim()) {
        throw Errors.internalError(`LLM 返回的 chunk #${i} 缺少 content`)
      }
      return {
        index: i,
        title: chunk.title.trim(),
        content: chunk.content.trim(),
      }
    })
  }

  async shouldIngestChunk(
    chunk: string,
    existingMemories: Array<{ id: string; content: string; score: number }>,
    kbId?: string
  ): Promise<{
    action: 'skip' | 'merge' | 'new'
    reason: string
    targetMemoryId: string | null
    mergedContent: string | null
  }> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: provider.vendor.id,
        vendorName: provider.vendor.name,
        task: 'deduplication',
      },
    })

    const memoriesText = existingMemories
      .map((m, i) => `[相似记忆${i + 1}, 相关度=${m.score.toFixed(2)}]\n${m.content}`)
      .join('\n\n')

    const systemPrompt = Prompts.deduplicationExpert()
    const prompt = Prompts.deduplicateChunk(chunk, memoriesText)

    const validActions = ['skip', 'merge', 'new']
    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, session.id, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw Errors.internalError('响应格式无效: 缺少 action 或 action 值不合法')
      }
      const obj = raw as { action?: unknown; reason?: unknown; targetId?: unknown; mergedContent?: unknown }
      if (!obj.action || !validActions.includes(obj.action as string)) {
        throw Errors.internalError('响应格式无效: 缺少 action 或 action 值不合法')
      }
      const action = obj.action as 'skip' | 'merge' | 'new'
      if (action === 'merge') {
        if (obj.targetId == null || typeof obj.targetId !== 'number' || obj.targetId < 1 || obj.targetId > existingMemories.length) {
          throw Errors.internalError('响应格式无效: merge 操作必须指定有效的 targetId')
        }
        if (!obj.mergedContent || typeof obj.mergedContent !== 'string' || obj.mergedContent.trim().length === 0) {
          throw Errors.internalError('响应格式无效: merge 操作必须提供 mergedContent')
        }
      }
      return obj as { action: string; reason?: string; targetId?: number | null; mergedContent?: string | null }
    })

    await this.sessionService.complete(session.id)

    const action = parsed.action as 'skip' | 'merge' | 'new'
    let targetMemoryId: string | null = null
    let mergedContent: string | null = null

    if (action === 'merge') {
      targetMemoryId = existingMemories[parsed.targetId! - 1].id
      mergedContent = parsed.mergedContent!.trim()
    }

    if (!parsed.reason) {
      throw Errors.internalError('LLM 响应缺少 reason 字段')
    }

    return { action, reason: parsed.reason, targetMemoryId, mergedContent }
  }

  async getModelInfo(): Promise<{ provider: string; model: string }> {
    const { model, provider } = await this.getDefaultModel()
    return {
      provider: provider.name,
      model: model.displayName ?? model.name,
    }
  }

  async matchTopic(
    content: string,
    existingTopics: Array<{ name: string; description: string }>,
    kbId?: string
  ): Promise<TopicMatchResult> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: provider.vendor.id,
        vendorName: provider.vendor.name,
        task: 'topic-match',
      },
    })

    const systemPrompt = Prompts.topicMatchExpert()
    const prompt = Prompts.topicMatch(content, existingTopics)

    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, session.id, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw Errors.internalError('响应格式无效: 缺少 action 或 action 值不合法')
      }
      const obj = raw as { action?: unknown; topicName?: unknown; reason?: unknown }
      if (!obj.action || !['select', 'create'].includes(obj.action as string)) {
        throw Errors.internalError('响应格式无效: 缺少 action 或 action 值不合法')
      }
      if (obj.action === 'select' && !obj.topicName) {
        throw Errors.internalError('响应格式无效: select 操作必须指定 topicName')
      }
      return obj as { action: string; topicName?: string; reason?: string }
    })

    await this.sessionService.complete(session.id)

    if (!parsed.reason) {
      throw Errors.internalError('LLM 响应缺少 reason 字段')
    }

    return {
      action: parsed.action as 'select' | 'create',
      topicName: parsed.topicName,
      reason: parsed.reason,
    }
  }

  async createTopicInfo(content: string, kbId?: string): Promise<TopicCreateInfo> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: provider.vendor.id,
        vendorName: provider.vendor.name,
        task: 'topic-create',
      },
    })

    const systemPrompt = Prompts.topicMatchExpert()
    const prompt = Prompts.topicCreate(content)

    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, session.id, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw Errors.internalError('响应格式无效: 缺少 name')
      }
      const obj = raw as { name?: unknown; description?: unknown }
      if (!obj.name || typeof obj.name !== 'string' || obj.name.trim().length === 0) {
        throw Errors.internalError('响应格式无效: 缺少 name')
      }
      if (!obj.description || typeof obj.description !== 'string' || obj.description.trim().length === 0) {
        throw Errors.internalError('响应格式无效: 缺少 description')
      }
      return obj as { name: string; description: string }
    })

    await this.sessionService.complete(session.id)

    return {
      name: parsed.name.trim(),
      description: parsed.description.trim(),
    }
  }

  async batchCreateTopics(
    proposedTopics: Array<{ name: string; sampleContent: string }>,
    kbId?: string
  ): Promise<TopicCreateInfo[]> {
    if (proposedTopics.length === 0) return []

    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: provider.vendor.id,
        vendorName: provider.vendor.name,
        task: 'batch-topic-create',
      },
    })

    const systemPrompt = Prompts.topicMatchExpert()
    const prompt = Prompts.batchTopicCreate(proposedTopics)

    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, session.id, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw Errors.internalError('响应格式无效: 缺少 topics 数组')
      }
      const obj = raw as { topics?: unknown }
      if (!obj.topics || !Array.isArray(obj.topics) || (obj.topics as any[]).length === 0) {
        throw Errors.internalError('响应格式无效: 缺少 topics 数组')
      }
      return obj as { topics: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.topics
      .filter((t: any) => t.name && t.name.trim().length > 0)
      .map((t: any) => ({
        name: t.name.trim(),
        description: t.description ? t.description.trim() : '',
      }))
  }

  /**
   * 批量主题规划：一次调用 LLM 为所有切片统一分配主题（基于标题）
   */
  async batchResolveTopics(
    chunks: TitledChunk[],
    existingTopics: Array<{ id: string; name: string; description: string }>,
    kbId?: string
  ): Promise<BatchTopicPlan> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.internalError('提供商缺少厂商信息')
    }

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: provider.vendor.id,
        vendorName: provider.vendor.name,
        task: 'batch-topic-match',
      },
    })

    const systemPrompt = Prompts.topicMatchExpert()
    const prompt = Prompts.batchTopicMatch(
      chunks.map((c) => ({ index: c.index, title: c.title })),
      existingTopics.map((t) => ({ name: t.name, description: t.description }))
    )

    const parsed = await this.callLLMAndValidate(
      prompt, systemPrompt, model, provider, session.id,
      (raw) => {
        if (!raw || typeof raw !== 'object') {
          throw Errors.internalError('响应格式无效: 缺少 plans 数组或数组为空')
        }
        const obj = raw as { plans?: unknown }
        if (!obj.plans || !Array.isArray(obj.plans) || obj.plans.length === 0) {
          throw Errors.internalError('响应格式无效: 缺少 plans 数组或数组为空')
        }

        const validTopicNames = new Set(existingTopics.map((t) => t.name))

        for (let i = 0; i < obj.plans.length; i++) {
          const p = (obj.plans as any[])[i]
          if (p == null || typeof p !== 'object') {
            throw Errors.internalError(`响应格式无效: plans[${i}] 不是有效对象`)
          }
          if (p.index == null || p.index < 0) {
            throw Errors.internalError(`响应格式无效: plans[${i}] 缺少有效的 index`)
          }
          if (!p.action || !['select', 'create'].includes(p.action)) {
            throw Errors.internalError(`响应格式无效: plans[${i}] 的 action 值不合法`)
          }
          if (p.action === 'select' && !p.topicName) {
            throw Errors.internalError(`响应格式无效: plans[${i}] select 操作必须指定 topicName`)
          }
          if (p.action === 'create' && !p.newTopicName) {
            throw Errors.internalError(`响应格式无效: plans[${i}] create 操作必须指定 newTopicName`)
          }
          if (p.action === 'select' && !validTopicNames.has(p.topicName)) {
            throw Errors.internalError(
              `plans[${i}] 的 topicName "${p.topicName}" 不在已有主题列表中，必须是已有主题的短名称（如 ${Array.from(validTopicNames).slice(0, 3).join('、')} 等）`
            )
          }
        }

        return obj as { plans: Array<{ index: number; action: string; topicName?: string; newTopicName?: string; reason?: string }> }
      }
    )

    await this.sessionService.complete(session.id)

    const plans = parsed.plans.map((p) => {
      if (!p.reason) {
        throw Errors.internalError('LLM 响应中某个 topic 计划缺少 reason 字段')
      }
      return {
        index: p.index,
        action: p.action as 'select' | 'create',
        topicName: p.topicName,
        newTopicName: p.newTopicName,
        reason: p.reason,
      }
    })

    return { plans }
  }

  clearCache(): void {
    this.modelCache.clear()
  }
}
