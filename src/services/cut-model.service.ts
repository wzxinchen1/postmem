import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Errors } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { Model, Provider, CutPoint, IngestMessage, MessageGroup, ModelType, TopicMatchResult, TopicCreateInfo, BatchTopicPlan, TitledChunk } from '@/src/types'
import { SessionService } from '@/src/services/session.service'
import { VendorService } from './vendor.service'

export class CutModelService {
  private prisma: PrismaClient
  private sessionService: SessionService
  private vendorService: VendorService
  private modelCache: Map<string, { model: Model; provider: Provider }> = new Map<string, { model: Model; provider: Provider }>()

  private static readonly MAX_RETRIES = 5

  constructor({ prisma, sessionService }: { prisma: PrismaClient; sessionService: SessionService }) {
    this.prisma = prisma
    this.sessionService = sessionService
    this.vendorService = new VendorService({ prisma })
  }

  private async getDefaultModel(): Promise<{ model: Model; provider: Provider }> {
    const cacheKey = 'default_chat'
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!
    }

    const model = await this.prisma.model.findFirst({
      where: {
        modelType: 'chat',
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
      throw Errors.cutModelError('未配置默认对话模型，请在 /admin/models 页面配置')
    }

    const result: { model: Model; provider: Provider } = {
      model: {
        id: model.id,
        providerId: model.providerId,
        name: model.name,
        displayName: model.displayName || undefined,
        modelType: model.modelType as ModelType,
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
          chatModelClass: model.provider.vendor.chatModelClass,
          embeddingModelClass: model.provider.vendor.embeddingModelClass,
          factoryCode: model.provider.vendor.factoryCode,
          isActive: model.provider.vendor.isActive,
          createdAt: model.provider.vendor.createdAt,
          updatedAt: model.provider.vendor.updatedAt,
        },
        apiKey: model.provider.apiKey || undefined,
        baseUrl: model.provider.baseUrl || '',
        config: model.provider.config as Record<string, unknown>,
        isActive: model.provider.isActive,
        createdAt: model.provider.createdAt,
        updatedAt: model.provider.updatedAt,
      },
    }
    this.modelCache.set(cacheKey, result)
    return result
  }

  private async createModel(model: Model, provider: Provider): Promise<BaseChatModel> {
    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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
    sessionId: number
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

    const response = await chatModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt),
    ])

    const content = response.content.toString()

    const messageMetadata: Record<string, unknown> = { model: model.name }
    const additionalKwargs = response.additional_kwargs || {}
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

  private parseJSON<T>(response: string): T {
    let jsonStr = response.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }
    return JSON.parse(jsonStr)
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
    sessionId: number,
    validator: (parsed: unknown) => T
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= CutModelService.MAX_RETRIES; attempt++) {
      try {
        const content = await this.callLLM(prompt, systemPrompt, model, provider, sessionId)
        const parsed = this.parseJSON<unknown>(content)
        return validator(parsed)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    throw Errors.cutModelError(
      `LLM 调用失败，已重试 ${CutModelService.MAX_RETRIES} 次: ${lastError?.message}`
    )
  }

  async analyzeCutPoints(text: string, kbId?: number): Promise<CutPoint[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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
        throw Errors.cutModelError('响应格式无效: 缺少 cutPoints 数组')
      }
      const obj = raw as { cutPoints?: unknown }
      if (!obj.cutPoints || !Array.isArray(obj.cutPoints)) {
        throw Errors.cutModelError('响应格式无效: 缺少 cutPoints 数组')
      }
      return obj as { cutPoints: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.cutPoints.map((point: any) => ({
      index: Number(point.index),
      reason: point.reason,
    }))
  }

  async analyzeMessageGroups(messages: IngestMessage[], kbId?: number): Promise<MessageGroup[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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
        throw Errors.cutModelError('响应格式无效: 缺少 groups 数组')
      }
      const obj = raw as { groups?: unknown }
      if (!obj.groups || !Array.isArray(obj.groups)) {
        throw Errors.cutModelError('响应格式无效: 缺少 groups 数组')
      }
      return obj as { groups: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.groups.map((group: any) => ({
      messageIds: group.messageIds || [],
      summary: group.summary,
      isComplete: group.isComplete !== false,
    }))
  }

  async analyzeTextGroups(text: string, kbId?: number): Promise<MessageGroup[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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
        throw Errors.cutModelError('响应格式无效: 缺少 groups 数组')
      }
      const obj = raw as { groups?: unknown }
      if (!obj.groups || !Array.isArray(obj.groups)) {
        throw Errors.cutModelError('响应格式无效: 缺少 groups 数组')
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

  async cutAndRewrite(text: string, kbId?: number): Promise<TitledChunk[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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

    const systemPrompt = Prompts.cutAndRewriteExpert()
    const prompt = Prompts.cutAndRewrite(text)

    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, session.id, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw Errors.cutModelError('响应格式无效: 缺少 chunks 数组或数组为空')
      }
      const obj = raw as { chunks?: unknown }
      if (!obj.chunks || !Array.isArray(obj.chunks) || (obj.chunks as any[]).length === 0) {
        throw Errors.cutModelError('响应格式无效: 缺少 chunks 数组或数组为空')
      }
      return obj as { chunks: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.chunks.map((chunk: any, i: number) => ({
      index: i,
      title: (chunk.title || `片段${i}`).trim(),
      content: chunk.content.trim(),
    }))
  }

  async shouldIngestChunk(
    chunk: string,
    existingMemories: Array<{ id: number; content: string; score: number }>,
    kbId?: number
  ): Promise<{
    action: 'skip' | 'merge' | 'new'
    reason: string
    targetMemoryId: number | null
    mergedContent: string | null
  }> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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
        throw Errors.cutModelError('响应格式无效: 缺少 action 或 action 值不合法')
      }
      const obj = raw as { action?: unknown; reason?: unknown; targetId?: unknown; mergedContent?: unknown }
      if (!obj.action || !validActions.includes(obj.action as string)) {
        throw Errors.cutModelError('响应格式无效: 缺少 action 或 action 值不合法')
      }
      const action = obj.action as 'skip' | 'merge' | 'new'
      if (action === 'merge') {
        if (obj.targetId == null || typeof obj.targetId !== 'number' || obj.targetId < 1 || obj.targetId > existingMemories.length) {
          throw Errors.cutModelError('响应格式无效: merge 操作必须指定有效的 targetId')
        }
        if (!obj.mergedContent || typeof obj.mergedContent !== 'string' || obj.mergedContent.trim().length === 0) {
          throw Errors.cutModelError('响应格式无效: merge 操作必须提供 mergedContent')
        }
      }
      return obj as { action: string; reason?: string; targetId?: number | null; mergedContent?: string | null }
    })

    await this.sessionService.complete(session.id)

    const action = parsed.action as 'skip' | 'merge' | 'new'
    let targetMemoryId: number | null = null
    let mergedContent: string | null = null

    if (action === 'merge') {
      targetMemoryId = existingMemories[parsed.targetId! - 1].id
      mergedContent = parsed.mergedContent!.trim()
    }

    return { action, reason: parsed.reason || '', targetMemoryId, mergedContent }
  }

  async getModelInfo(): Promise<{ provider: string; model: string }> {
    const { model, provider } = await this.getDefaultModel()
    return {
      provider: provider.name,
      model: model.displayName || model.name,
    }
  }

  async matchTopic(
    content: string,
    existingTopics: Array<{ name: string; description: string }>,
    kbId?: number
  ): Promise<TopicMatchResult> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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
        throw Errors.cutModelError('响应格式无效: 缺少 action 或 action 值不合法')
      }
      const obj = raw as { action?: unknown; topicName?: unknown; reason?: unknown }
      if (!obj.action || !['select', 'create'].includes(obj.action as string)) {
        throw Errors.cutModelError('响应格式无效: 缺少 action 或 action 值不合法')
      }
      if (obj.action === 'select' && !obj.topicName) {
        throw Errors.cutModelError('响应格式无效: select 操作必须指定 topicName')
      }
      return obj as { action: string; topicName?: string; reason?: string }
    })

    await this.sessionService.complete(session.id)

    return {
      action: parsed.action as 'select' | 'create',
      topicName: parsed.topicName,
      reason: parsed.reason || '',
    }
  }

  async createTopicInfo(content: string, kbId?: number): Promise<TopicCreateInfo> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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
        throw Errors.cutModelError('响应格式无效: 缺少 name')
      }
      const obj = raw as { name?: unknown; description?: unknown }
      if (!obj.name || typeof obj.name !== 'string' || obj.name.trim().length === 0) {
        throw Errors.cutModelError('响应格式无效: 缺少 name')
      }
      if (!obj.description || typeof obj.description !== 'string' || obj.description.trim().length === 0) {
        throw Errors.cutModelError('响应格式无效: 缺少 description')
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
    kbId?: number
  ): Promise<TopicCreateInfo[]> {
    if (proposedTopics.length === 0) return []

    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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
        throw Errors.cutModelError('响应格式无效: 缺少 topics 数组')
      }
      const obj = raw as { topics?: unknown }
      if (!obj.topics || !Array.isArray(obj.topics) || (obj.topics as any[]).length === 0) {
        throw Errors.cutModelError('响应格式无效: 缺少 topics 数组')
      }
      return obj as { topics: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.topics
      .filter((t: any) => t.name && t.name.trim().length > 0)
      .map((t: any) => ({
        name: t.name.trim(),
        description: t.description?.trim() || '',
      }))
  }

  /**
   * 批量主题规划：一次调用 LLM 为所有切片统一分配主题（基于标题）
   */
  async batchResolveTopics(
    chunks: TitledChunk[],
    existingTopics: Array<{ id: number; name: string; description: string }>,
    kbId?: number
  ): Promise<BatchTopicPlan> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw Errors.cutModelError('提供商缺少厂商信息')
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
          throw Errors.cutModelError('响应格式无效: 缺少 plans 数组或数组为空')
        }
        const obj = raw as { plans?: unknown }
        if (!obj.plans || !Array.isArray(obj.plans) || obj.plans.length === 0) {
          throw Errors.cutModelError('响应格式无效: 缺少 plans 数组或数组为空')
        }

        const validTopicNames = new Set(existingTopics.map((t) => t.name))

        for (let i = 0; i < obj.plans.length; i++) {
          const p = (obj.plans as any[])[i]
          if (p == null || typeof p !== 'object') {
            throw Errors.cutModelError(`响应格式无效: plans[${i}] 不是有效对象`)
          }
          if (p.index == null || p.index < 0) {
            throw Errors.cutModelError(`响应格式无效: plans[${i}] 缺少有效的 index`)
          }
          if (!p.action || !['select', 'create'].includes(p.action)) {
            throw Errors.cutModelError(`响应格式无效: plans[${i}] 的 action 值不合法`)
          }
          if (p.action === 'select' && !p.topicName) {
            throw Errors.cutModelError(`响应格式无效: plans[${i}] select 操作必须指定 topicName`)
          }
          if (p.action === 'create' && !p.newTopicName) {
            throw Errors.cutModelError(`响应格式无效: plans[${i}] create 操作必须指定 newTopicName`)
          }
          if (p.action === 'select' && !validTopicNames.has(p.topicName)) {
            throw Errors.cutModelError(
              `plans[${i}] 的 topicName "${p.topicName}" 不在已有主题列表中，必须是已有主题的短名称（如 ${Array.from(validTopicNames).slice(0, 3).join('、')} 等）`
            )
          }
        }

        return obj as { plans: Array<{ index: number; action: string; topicName?: string; newTopicName?: string; reason?: string }> }
      }
    )

    await this.sessionService.complete(session.id)

    const plans = parsed.plans.map((p) => ({
      index: p.index,
      action: p.action as 'select' | 'create',
      topicName: p.topicName,
      newTopicName: p.newTopicName,
      reason: p.reason || '',
    }))

    return { plans }
  }

  clearCache(): void {
    this.modelCache.clear()
  }
}
