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
      config: model.config,
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

    await this.sessionService.addMessage({
      sessionId,
      role: 'assistant',
      content,
      metadata: { model: model.name },
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

    const content = await this.callLLM(prompt, systemPrompt, model, provider, session.id)

    await this.sessionService.complete(session.id)

    const parsed = this.parseJSON<{ cutPoints?: any[] }>(content)
    if (!parsed.cutPoints || !Array.isArray(parsed.cutPoints)) {
      throw Errors.cutModelError('响应格式无效: 缺少 cutPoints 数组')
    }

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

    const content = await this.callLLM(prompt, systemPrompt, model, provider, session.id)

    await this.sessionService.complete(session.id)

    const parsed = this.parseJSON<{ groups?: any[] }>(content)
    if (!parsed.groups || !Array.isArray(parsed.groups)) {
      throw Errors.cutModelError('响应格式无效: 缺少 groups 数组')
    }

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

    const content = await this.callLLM(prompt, systemPrompt, model, provider, session.id)

    await this.sessionService.complete(session.id)

    const parsed = this.parseJSON<{ groups?: any[] }>(content)
    if (!parsed.groups || !Array.isArray(parsed.groups)) {
      throw Errors.cutModelError('响应格式无效: 缺少 groups 数组')
    }

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

    const content = await this.callLLM(prompt, systemPrompt, model, provider, session.id)

    await this.sessionService.complete(session.id)

    const parsed = this.parseJSON<{ chunks?: Array<{ title?: string; content: string }> }>(content)
    if (!parsed.chunks || !Array.isArray(parsed.chunks) || parsed.chunks.length === 0) {
      throw Errors.cutModelError('响应格式无效: 缺少 chunks 数组或数组为空')
    }

    return parsed.chunks.map((chunk, i) => ({
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

    const content = await this.callLLM(prompt, systemPrompt, model, provider, session.id)

    await this.sessionService.complete(session.id)

    const parsed = this.parseJSON<{
      action?: string
      reason?: string
      targetId?: number | null
      mergedContent?: string | null
    }>(content)

    const validActions = ['skip', 'merge', 'new']
    if (!parsed.action || !validActions.includes(parsed.action)) {
      throw Errors.cutModelError('响应格式无效: 缺少 action 或 action 值不合法')
    }

    const action = parsed.action as 'skip' | 'merge' | 'new'
    let targetMemoryId: number | null = null
    let mergedContent: string | null = null

    if (action === 'merge') {
      if (parsed.targetId == null || parsed.targetId < 1 || parsed.targetId > existingMemories.length) {
        throw Errors.cutModelError('响应格式无效: merge 操作必须指定有效的 targetId')
      }
      if (!parsed.mergedContent || parsed.mergedContent.trim().length === 0) {
        throw Errors.cutModelError('响应格式无效: merge 操作必须提供 mergedContent')
      }
      targetMemoryId = existingMemories[parsed.targetId - 1].id
      mergedContent = parsed.mergedContent.trim()
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

    const response = await this.callLLM(prompt, systemPrompt, model, provider, session.id)

    await this.sessionService.complete(session.id)

    const parsed = this.parseJSON<{
      action?: string
      topicName?: string
      reason?: string
    }>(response)

    if (!parsed.action || !['select', 'create'].includes(parsed.action)) {
      throw Errors.cutModelError('响应格式无效: 缺少 action 或 action 值不合法')
    }

    if (parsed.action === 'select' && !parsed.topicName) {
      throw Errors.cutModelError('响应格式无效: select 操作必须指定 topicName')
    }

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

    const response = await this.callLLM(prompt, systemPrompt, model, provider, session.id)

    await this.sessionService.complete(session.id)

    const parsed = this.parseJSON<{
      name?: string
      description?: string
    }>(response)

    if (!parsed.name || parsed.name.trim().length === 0) {
      throw Errors.cutModelError('响应格式无效: 缺少 name')
    }
    if (!parsed.description || parsed.description.trim().length === 0) {
      throw Errors.cutModelError('响应格式无效: 缺少 description')
    }

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

    const response = await this.callLLM(prompt, systemPrompt, model, provider, session.id)

    await this.sessionService.complete(session.id)

    const parsed = this.parseJSON<{ topics?: Array<{ name?: string; description?: string }> }>(response)

    if (!parsed.topics || !Array.isArray(parsed.topics) || parsed.topics.length === 0) {
      throw Errors.cutModelError('响应格式无效: 缺少 topics 数组')
    }

    return parsed.topics
      .filter((t) => t.name && t.name.trim().length > 0)
      .map((t) => ({
        name: t.name!.trim(),
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

    const response = await this.callLLM(prompt, systemPrompt, model, provider, session.id)

    await this.sessionService.complete(session.id)

    const parsed = this.parseJSON<{ plans?: Array<{ index?: number; action?: string; topicName?: string; newTopicName?: string; reason?: string }> }>(response)

    if (!parsed.plans || !Array.isArray(parsed.plans) || parsed.plans.length === 0) {
      throw Errors.cutModelError('响应格式无效: 缺少 plans 数组或数组为空')
    }

    const plans = parsed.plans.map((p, i) => {
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
      return {
        index: p.index,
        action: p.action as 'select' | 'create',
        topicName: p.topicName,
        newTopicName: p.newTopicName,
        reason: p.reason || '',
      }
    })

    return { plans }
  }

  clearCache(): void {
    this.modelCache.clear()
  }
}
