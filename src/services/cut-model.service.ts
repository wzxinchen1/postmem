import { ChatOpenAI } from '@langchain/openai'
import { ChatOllama } from '@langchain/ollama'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { Errors } from '@/src/lib/errors'
import type { PrismaClient } from '@prisma/client'
import type { Model, Provider, CutPoint, IngestMessage, MessageGroup, ModelType } from '@/src/types'
import { SessionService } from '@/src/services/session.service'
import { VendorRegistryService } from './vendor-registry.service'

export class CutModelService {
  private prisma: PrismaClient
  private sessionService: SessionService
  private vendorRegistry: VendorRegistryService
  private modelCache: Map<string, { model: Model; provider: Provider }> = new Map<string, { model: Model; provider: Provider }>()

  constructor({ prisma, sessionService }: { prisma: PrismaClient; sessionService: SessionService }) {
    this.prisma = prisma
    this.sessionService = sessionService
    this.vendorRegistry = new VendorRegistryService()
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
        provider: true,
      },
    })

    if (!model || !model.provider) {
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

  private createChatModel(model: Model, provider: Provider) {
    const vendor = this.vendorRegistry.identify(provider.baseUrl)

    if (vendor.id === 'ollama' || provider.baseUrl.includes('localhost:11434')) {
      return new ChatOllama({
        model: model.name,
        baseUrl: provider.baseUrl,
        format: 'json',
      })
    }

    return new ChatOpenAI({
      model: model.name,
      apiKey: provider.apiKey || 'test',
      configuration: {
        baseURL: provider.baseUrl,
      },
    })
  }

  private async callLLM(
    prompt: string,
    systemPrompt: string,
    model: Model,
    provider: Provider,
    sessionId: number
  ): Promise<string> {
    const chatModel = this.createChatModel(model, provider)

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
    const vendor = this.vendorRegistry.identify(provider.baseUrl)

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: vendor.id,
        vendorName: vendor.name,
      },
    })

    const systemPrompt = 'You are a text analysis expert. Always respond with valid JSON only.'
    const prompt = this.buildCutPointsPrompt(text)

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
    const vendor = this.vendorRegistry.identify(provider.baseUrl)

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: vendor.id,
        vendorName: vendor.name,
      },
    })

    const systemPrompt = 'You are a conversation analysis expert. Always respond with valid JSON only.'
    const prompt = this.buildMessageAnalysisPrompt(messages)

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
    const vendor = this.vendorRegistry.identify(provider.baseUrl)

    const session = await this.sessionService.create({
      kbId,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        vendorId: vendor.id,
        vendorName: vendor.name,
      },
    })

    const systemPrompt = 'You are a text analysis expert. Always respond with valid JSON only.'
    const prompt = this.buildTextAnalysisPrompt(text)

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

  private buildCutPointsPrompt(text: string): string {
    return `分析以下文本的逻辑结构，找出最佳的切割点。切割点应该选择在语义完整的位置，如段落结束、章节结束或主题转换处。

文本内容：
${text}

请返回 JSON 格式的切割点数组，格式如下：
{
  "cutPoints": [
    {"index": 100, "reason": "第一段结束"},
    {"index": 250, "reason": "第二章节开始"}
  ]
}

要求：
1. index 是切割点在原文中的字符位置（从0开始）
2. 每个片段长度建议在 200-1000 字符之间
3. 只返回 JSON，不要有其他说明文字
4. 如果文本很短不需要切割，返回空数组 {"cutPoints": []}`
  }

  private buildMessageAnalysisPrompt(messages: IngestMessage[]): string {
    const messageList = messages.map((m) =>
      `[${m.id}] ${m.role}: ${m.content}`
    ).join('\n')

    return `分析以下对话消息列表，识别其中包含的所有独立话题。消息列表可能讨论了多件不同的事情，需要将讨论同一件事的消息分到同一组。

消息列表：
${messageList}

请返回 JSON 格式的消息分组数组，格式如下：
{
  "groups": [
    {
      "messageIds": ["msg1", "msg2"],
      "summary": "这组消息在讨论XXX",
      "isComplete": true
    },
    {
      "messageIds": ["msg3", "msg4"],
      "summary": "这组消息在讨论YYY",
      "isComplete": true
    }
  ]
}

要求：
1. 仔细分析消息内容，识别所有独立的话题，每个话题对应一个 group
2. messageIds 是该组消息的 ID 数组，按消息顺序排列
3. summary 是对该组消息内容的简要描述
4. isComplete 表示这组消息是否形成了一个完整的话题（有明确的开始和结束）
5. 最近的消息（最后几条）如果话题尚未结束，设置 isComplete 为 false
6. 只返回 JSON，不要有其他说明文字
7. 确保所有消息都被分配到某个分组中`
  }

  private buildTextAnalysisPrompt(text: string): string {
    return `分析以下文本，识别其中包含的所有独立话题或主题。一段文本可能讨论了多件不同的事情，需要将它们分开。

文本内容：
${text.slice(0, 3000)}

请返回 JSON 格式的分组数组，格式如下：
{
  "groups": [
    {
      "summary": "这部分文本讨论的是XXX",
      "isComplete": true
    },
    {
      "summary": "这部分文本讨论的是YYY",
      "isComplete": true
    }
  ]
}

要求：
1. 仔细分析文本，识别所有独立的话题，每个话题对应一个 group
2. summary 是对该话题内容的简要描述
3. isComplete 表示该话题是否完整（有明确的开始和结束）
4. 如果文本末尾话题未结束，设置 isComplete 为 false
5. 只返回 JSON，不要有其他说明文字
6. 确保所有文本内容都被分配到某个话题中`
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
