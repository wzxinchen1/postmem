import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AppError } from '@/src/lib/errors'
import { Prompts } from '@/src/lib/prompts'
import { logger } from '@/src/lib/logger'
import type { PrismaClient } from '@/src/generated/prisma/client/client'
import type { Model, Provider, CutPoint, IngestMessage, MessageGroup, ModelCapability, TopicCreateInfo, BatchTopicPlan, TitledChunk, ChunkTopicPlan } from '@/src/types'
import { ThinkingEffort } from '@/src/types'
import { SessionService } from '@/src/services/session.service'
import { VendorService } from './vendor.service'
import { LLMResilienceService } from '@/src/services/llm-resilience.service'
import type { IChatSettingProvider } from '@/src/interfaces/chat-setting-provider'

type ProgressCallback = (event: { type: string; message?: string; data?: Record<string, unknown> }) => void

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
  private static readonly MAX_CHUNK_CHARS = 1000
  private static readonly MAX_CUT_DEPTH = 3

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
      throw new AppError('CUT_MODEL_DEFAULT_NOT_CONFIGURED')
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

  private async createModel(model: Model, provider: Provider, reasoningEffort?: string): Promise<BaseChatModel> {
    if (!provider.vendor) {
      throw new AppError('CUT_MODEL_PROVIDER_MISSING_VENDOR')
    }

    const config: Record<string, unknown> = { ...model.config }
    if (reasoningEffort) {
      config.reasoning = true
      config.reasoningEffort = reasoningEffort
    }

    return this.vendorService.createModel(provider.vendor, {
      model: model.name,
      modelType: 'chat',
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      config,
    }) as BaseChatModel
  }

  private async callLLM(
    prompt: string,
    systemPrompt: string,
    model: Model,
    provider: Provider,
    sessionId: string | undefined,
    reasoningEffort?: string,
    additionalMessages: { role: string; content: string }[] = []
  ): Promise<string> {
    const chatModel = await this.createModel(model, provider, reasoningEffort)

    if (sessionId !== undefined) {
      await this.sessionService.addMessage({ sessionId, role: 'system', content: systemPrompt })
      await this.sessionService.addMessage({ sessionId, role: 'user', content: prompt })
    }

    let additionalMessagesLength = 0
    for (const m of additionalMessages) {
      additionalMessagesLength += m.content.length
    }

    logger.info('[CutModelService] callLLM', {
      model: model.name,
      provider: provider.name,
      sessionId,
      systemPromptLength: systemPrompt.length,
      promptLength: prompt.length,
      additionalMessagesCount: additionalMessages.length,
      additionalMessagesLength,
      totalLength: systemPrompt.length + prompt.length + additionalMessagesLength,
    })
    const messages = [
      new SystemMessage(systemPrompt),
      ...additionalMessages.map((m) =>
        m.role === 'assistant' ? new AIMessage(m.content) : new HumanMessage(m.content)
      ),
      new HumanMessage(prompt),
    ]
    const invokeStart = Date.now()
    const response = await chatModel.invoke(messages)
    const invokeElapsed = Date.now() - invokeStart
    logger.info('[CutModelService] callLLM responsed', { invokeElapsedMs: invokeElapsed, responseContentLength: response.content.toString().length })
    const content = response.content.toString()

    if (response.additional_kwargs == null) {
      throw new AppError('CUT_MODEL_LLM_SDK_NULL_ADDITIONAL_KWARGS')
    }

    if (sessionId !== undefined) {
      const messageMetadata: Record<string, unknown> = { model: model.name }
      const additionalKwargs = response.additional_kwargs
      if (additionalKwargs.reasoning_content) {
        messageMetadata.reasoning_content = additionalKwargs.reasoning_content
      }
      await this.sessionService.addMessage({ sessionId, role: 'assistant', content, metadata: messageMetadata })
    }

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
    sessionId: string | undefined,
    validator: (parsed: unknown) => T,
    reasoningEffort?: string,
    additionalMessages: { role: string; content: string }[] = [],
    onProgress?: ProgressCallback
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= CutModelService.MAX_RETRIES; attempt++) {
      let content: string
      try {
        content = await this.callLLM(prompt, systemPrompt, model, provider, sessionId, reasoningEffort, additionalMessages)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        logger.error('[CutModelService] LLM 调用失败，准备重试', {
          attempt,
          maxRetries: CutModelService.MAX_RETRIES,
          errorMessage: lastError.message,
          stack: lastError.stack,
        })

        if (onProgress) {
          onProgress({
            type: 'status',
            message: `LLM 调用失败，第 ${attempt}/${CutModelService.MAX_RETRIES} 次重试...`,
          })
        }
        continue
      }

      try {
        const parsed = this.llmResilienceService.parseJSON<unknown>(content)
        return validator(parsed)
      } catch (parseError) {
        logger.error('[CutModelService] parseJSON 原始输入', {
          contentLength: content.length,
          contentPrefix: content.slice(0, 500),
          contentSuffix: content.slice(-200),
        })
        lastError = parseError instanceof Error ? parseError : new Error(String(parseError))

        logger.error('[CutModelService] 解析/校验失败，准备重试', {
          attempt,
          maxRetries: CutModelService.MAX_RETRIES,
          errorMessage: lastError.message,
          stack: lastError.stack,
          rawResponse: content.slice(0, 2000),
        })

        if (onProgress) {
          onProgress({
            type: 'status',
            message: `LLM 响应解析失败，第 ${attempt}/${CutModelService.MAX_RETRIES} 次重试...`,
          })
        }
      }
    }

    throw new AppError('CUT_MODEL_LLM_FAILED', { maxRetries: CutModelService.MAX_RETRIES }, lastError ?? new Error('未知错误'))
  }

  async analyzeCutPoints(text: string, kbId?: string): Promise<CutPoint[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw new AppError('CUT_MODEL_PROVIDER_MISSING_VENDOR')
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
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_CUTPOINTS')
      }
      const obj = raw as { cutPoints?: unknown }
      if (!obj.cutPoints || !Array.isArray(obj.cutPoints)) {
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_CUTPOINTS')
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
      throw new AppError('CUT_MODEL_PROVIDER_MISSING_VENDOR')
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
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_GROUPS')
      }
      const obj = raw as { groups?: unknown }
      if (!obj.groups || !Array.isArray(obj.groups)) {
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_GROUPS')
      }
      return obj as { groups: any[] }
    })

    await this.sessionService.complete(session.id)

    return parsed.groups.map((group: any) => {
      if (group.messageIds == null) {
        throw new AppError('CUT_MODEL_GROUP_MISSING_MESSAGE_IDS')
      }
      if (!Array.isArray(group.messageIds)) {
        throw new AppError('CUT_MODEL_GROUP_INVALID_MESSAGE_IDS', { actualType: typeof group.messageIds })
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
      throw new AppError('CUT_MODEL_PROVIDER_MISSING_VENDOR')
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
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_GROUPS')
      }
      const obj = raw as { groups?: unknown }
      if (!obj.groups || !Array.isArray(obj.groups)) {
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_GROUPS')
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

  async cutAndRewrite(text: string, kbId?: string, onProgress?: ProgressCallback): Promise<TitledChunk[]> {
    const cutStart = Date.now()
    logger.info('[CutModelService] cutAndRewrite 开始', { inputTextLength: text.length, kbId })
    const rawChunks = await this.cutAndRewriteInternal(text, 0, kbId, [], undefined, onProgress)
    logger.info('[CutModelService] cutAndRewrite 完成', { chunksCount: rawChunks.length, textLength: text.length, elapsedMs: Date.now() - cutStart })
    return rawChunks.map((chunk, i) => ({ ...chunk, index: i }))
  }

  private async cutAndRewriteInternal(
    text: string,
    depth: number,
    kbId?: string,
    messageHistory: { role: string; content: string }[] = [],
    chunkIndex?: number,
    onProgress?: ProgressCallback
  ): Promise<TitledChunk[]> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw new AppError('CUT_MODEL_PROVIDER_MISSING_VENDOR')
    }

    const chatSetting = await this.chatSettingService.get()
    const charRange = chatSetting.chunkCharRange
    const systemPrompt = Prompts.cutAndRewriteExpert()

    const prompt = depth === 0
      ? Prompts.cutAndRewrite(text, charRange)
      : `第${chunkIndex}条过长，请修正，每次修正请完整发送所有的chunk内容`

    logger.info('[CutModelService] cutAndRewriteInternal 调用', { inputTextLength: text.length, promptLength: prompt.length, systemPromptLength: systemPrompt.length, modelName: model.name, depth, historyLength: messageHistory.length })

    if (onProgress) {
      onProgress({
        type: 'status',
        message: depth === 0
          ? '正在切分文本...'
          : `正在修正过长片段（第${depth}轮）...`,
      })
    }

    const llmStart = Date.now()
    const parsed = await this.callLLMAndValidate(prompt, systemPrompt, model, provider, undefined, (raw) => {
      if (!raw || typeof raw !== 'object') {
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_CHUNKS')
      }
      const obj = raw as { chunks?: unknown }
      if (!obj.chunks || !Array.isArray(obj.chunks) || (obj.chunks as any[]).length === 0) {
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_CHUNKS')
      }
      return obj as { chunks: any[] }
    }, ThinkingEffort.XHigh, messageHistory, onProgress)
    logger.info('[CutModelService] cutAndRewriteInternal LLM 返回', { depth, llmElapsedMs: Date.now() - llmStart, chunksCount: parsed.chunks.length })

    const chunks: TitledChunk[] = parsed.chunks.map((chunk: any, i: number) => {
      if (!chunk.title || !chunk.title.trim()) {
        throw new AppError('CUT_MODEL_CHUNK_MISSING_TITLE', { index: i })
      }
      if (!chunk.content || !chunk.content.trim()) {
        throw new AppError('CUT_MODEL_CHUNK_MISSING_CONTENT', { index: i })
      }
      return {
        index: i,
        title: chunk.title.trim(),
        content: chunk.content.trim(),
      }
    })

    if (depth >= CutModelService.MAX_CUT_DEPTH) {
      const longChunks = chunks.filter(c => c.content.length > CutModelService.MAX_CHUNK_CHARS)
      if (longChunks.length > 0) {
        throw new AppError('CUT_MODEL_RECURSION_EXCEEDED', {
          depth: CutModelService.MAX_CUT_DEPTH,
          maxChunkChars: CutModelService.MAX_CHUNK_CHARS,
          longChunks: JSON.stringify(longChunks.map(c => ({ title: c.title, contentLength: c.content.length }))),
        })
      }
      return chunks
    }

    const roundHistory = [
      { role: 'user' as const, content: prompt },
      { role: 'assistant' as const, content: JSON.stringify(parsed) },
    ]

    let resultChunks: TitledChunk[] = chunks

    while (true) {
      let fixed = false

      for (let i = 0; i < resultChunks.length; i++) {
        if (resultChunks[i].content.length > CutModelService.MAX_CHUNK_CHARS) {
          logger.info('[CutModelService] cutAndRewrite 递归修正', { depth: depth + 1, chunkTitle: resultChunks[i].title, chunkContentLength: resultChunks[i].content.length })

          if (onProgress) {
            onProgress({
              type: 'status',
              message: `正在修正过长片段：${resultChunks[i].title}（${resultChunks[i].content.length}字符，第${depth + 1}轮）`,
            })
          }

          const recurseStart = Date.now()
          const subChunks = await this.cutAndRewriteInternal(
            resultChunks[i].content, depth + 1, kbId,
            [...messageHistory, ...roundHistory], i, onProgress
          )
          logger.info('[CutModelService] cutAndRewrite 递归修正完成', { depth: depth + 1, subChunksCount: subChunks.length, elapsedMs: Date.now() - recurseStart })

          resultChunks = [
            ...resultChunks.slice(0, i),
            ...subChunks,
            ...resultChunks.slice(i + 1),
          ]

          fixed = true
          break
        }
      }

      if (!fixed) break
    }

    return resultChunks
  }

  async getModelInfo(): Promise<{ provider: string; model: string }> {
    const { model, provider } = await this.getDefaultModel()
    return {
      provider: provider.name,
      model: model.displayName ?? model.name,
    }
  }

  async createTopicInfo(content: string, kbId?: string): Promise<TopicCreateInfo> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw new AppError('CUT_MODEL_PROVIDER_MISSING_VENDOR')
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
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_NAME')
      }
      const obj = raw as { name?: unknown; description?: unknown }
      if (!obj.name || typeof obj.name !== 'string' || obj.name.trim().length === 0) {
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_NAME')
      }
      if (!obj.description || typeof obj.description !== 'string' || obj.description.trim().length === 0) {
        throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_DESCRIPTION')
      }
      return obj as { name: string; description: string }
    })

    await this.sessionService.complete(session.id)

    return {
      name: parsed.name.trim(),
      description: parsed.description.trim(),
    }
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
      throw new AppError('CUT_MODEL_PROVIDER_MISSING_VENDOR')
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

    logger.info('[CutModelService] batchResolveTopics 输入', { chunksCount: chunks.length, existingTopicsCount: existingTopics.length, promptLength: prompt.length, systemPromptLength: systemPrompt.length, modelName: model.name })

    const parsed = await this.callLLMAndValidate(
      prompt, systemPrompt, model, provider, session.id,
      (raw) => {
        if (!raw || typeof raw !== 'object') {
          throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_PLANS')
        }
        const obj = raw as { plans?: unknown }
        if (!obj.plans || !Array.isArray(obj.plans) || obj.plans.length === 0) {
          throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_PLANS')
        }

        const validTopicNames = new Set(existingTopics.map((t) => t.name))

        for (let i = 0; i < obj.plans.length; i++) {
          const p = (obj.plans as any[])[i]
          if (p == null || typeof p !== 'object') {
            throw new AppError('CUT_MODEL_PLAN_INVALID_OBJECT', { index: i })
          }
          if (p.index == null || p.index < 0) {
            throw new AppError('CUT_MODEL_PLAN_MISSING_INDEX', { index: i })
          }
          if (!p.action || !['select', 'none'].includes(p.action)) {
            throw new AppError('CUT_MODEL_PLAN_INVALID_ACTION', { index: i })
          }
          if (p.action === 'select' && !p.topicName) {
            throw new AppError('CUT_MODEL_PLAN_SELECT_MISSING_TOPIC_NAME', { index: i })
          }
          if (p.action === 'select' && !validTopicNames.has(p.topicName)) {
            throw new AppError('CUT_MODEL_PLAN_INVALID_TOPIC_NAME', { index: i, topicName: p.topicName, validTopics: Array.from(validTopicNames).slice(0, 3).join(',') })
          }
        }

        return obj as { plans: Array<{ index: number; action: string; topicName?: string; reason?: string }> }
      }
    )

    await this.sessionService.complete(session.id)

    const plans: ChunkTopicPlan[] = []
    for (const p of parsed.plans) {
      if (!p.reason) {
        throw new AppError('CUT_MODEL_LLM_PLAN_MISSING_REASON')
      }
      if (p.action === 'select') {
        plans.push({
          index: p.index,
          action: 'select',
          topicName: p.topicName,
          reason: p.reason,
        })
      } else {
        plans.push({
          index: p.index,
          action: 'none',
          reason: p.reason,
        })
      }
    }

    return { plans }
  }

  async mergeTexts(
    chunks: Array<{ title: string; content: string }>,
    kbId?: string
  ): Promise<{ title: string; content: string }> {
    const { model, provider } = await this.getDefaultModel()

    if (!provider.vendor) {
      throw new AppError('CUT_MODEL_PROVIDER_MISSING_VENDOR')
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
        task: 'merge',
      },
    })

    const systemPrompt = Prompts.mergeExpert()
    const prompt = Prompts.mergeTexts(chunks)

    const parsed = await this.callLLMAndValidate(
      prompt, systemPrompt, model, provider, session.id,
      (raw) => {
        if (!raw || typeof raw !== 'object') {
          throw new AppError('CUT_MODEL_INVALID_FORMAT_MISSING_CHUNKS')
        }
        const obj = raw as { title?: unknown; content?: unknown }
        if (!obj.title || typeof obj.title !== 'string' || obj.title.trim().length === 0) {
          throw new AppError('CUT_MODEL_CHUNK_MISSING_TITLE', { index: 0 })
        }
        if (!obj.content || typeof obj.content !== 'string' || obj.content.trim().length === 0) {
          throw new AppError('CUT_MODEL_CHUNK_MISSING_CONTENT', { index: 0 })
        }
        return { title: obj.title.trim(), content: obj.content.trim() }
      },
      ThinkingEffort.XHigh
    )

    await this.sessionService.complete(session.id)

    return parsed
  }

  clearCache(): void {
    this.modelCache.clear()
  }
}
