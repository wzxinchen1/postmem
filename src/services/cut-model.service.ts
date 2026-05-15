import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Errors } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { Model, Provider, CutPoint, IngestMessage, MessageGroup, ModelType } from '@/src/types'
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

  async cutAndRewrite(text: string, kbId?: number): Promise<string[]> {
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

    const parsed = this.parseJSON<{ chunks?: Array<{ content: string; reason?: string }> }>(content)
    if (!parsed.chunks || !Array.isArray(parsed.chunks) || parsed.chunks.length === 0) {
      throw Errors.cutModelError('响应格式无效: 缺少 chunks 数组或数组为空')
    }

    return parsed.chunks.map((chunk: { content: string; reason?: string }) => chunk.content.trim())
  }

  async getModelInfo(): Promise<{ provider: string; model: string }> {
    const { model, provider } = await this.getDefaultModel()
    return {
      provider: provider.name,
      model: model.displayName || model.name,
    }
  }

  clearCache(): void {
    this.modelCache.clear()
  }
}
