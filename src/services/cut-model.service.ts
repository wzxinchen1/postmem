import { Errors } from '@/src/lib/errors'
import type { PrismaClient } from '@prisma/client'
import type { Model, Provider, CutPoint } from '@/src/types'
import { SessionService } from '@/src/services/session.service'

/**
 * 切割模型服务 - 从数据库配置动态使用模型
 */
export class CutModelService {
  private prisma: PrismaClient
  private sessionService: SessionService
  private modelCache: Map<string, { model: Model; provider: Provider }> = new Map()

  constructor({ prisma, sessionService }: { prisma: PrismaClient; sessionService: SessionService }) {
    this.prisma = prisma
    this.sessionService = sessionService
  }

  /**
   * 获取默认聊天模型配置
   */
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
      throw Errors.cutModelError('No default chat model configured. Please configure one in /admin/models')
    }

    const result = { model, provider: model.provider }
    this.modelCache.set(cacheKey, result)
    return result
  }

  /**
   * 分析文本并返回切割点
   */
  async analyzeCutPoints(text: string, kbName?: string): Promise<CutPoint[]> {
    const { model, provider } = await this.getDefaultModel()

    const session = await this.sessionService.create({
      kbName,
      modelType: 'chat',
      modelName: model.name,
      provider: provider.name,
      metadata: {
        displayName: model.displayName,
        providerType: provider.type,
      },
    })

    let result: CutPoint[]
    
    switch (provider.type) {
      case 'local':
        result = await this.analyzeWithOllama(text, model.name, provider.baseUrl || 'http://localhost:11434', session.id)
        break
      case 'openai':
        result = await this.analyzeWithOpenAI(text, model.name, provider.apiKey!, session.id)
        break
      case 'anthropic':
        result = await this.analyzeWithAnthropic(text, model.name, provider.apiKey!, session.id)
        break
      case 'custom':
        result = await this.analyzeWithCustom(text, model.name, provider.baseUrl!, provider.apiKey, session.id)
        break
      default:
        throw Errors.cutModelError(`Unknown provider type: ${provider.type}`)
    }

    await this.sessionService.complete(session.id)
    return result
  }

  /**
   * 使用 Ollama 分析
   */
  private async analyzeWithOllama(text: string, modelName: string, baseUrl: string, sessionId: number): Promise<CutPoint[]> {
    const prompt = this.buildPrompt(text)
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'user',
      content: prompt,
    })

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt,
        stream: false,
        format: 'json',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw Errors.cutModelError(`Ollama API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'assistant',
      content: data.response,
      metadata: { model: modelName },
    })

    return this.parseCutPoints(data.response)
  }

  /**
   * 使用 OpenAI 分析
   */
  private async analyzeWithOpenAI(text: string, modelName: string, apiKey: string, sessionId: number): Promise<CutPoint[]> {
    const prompt = this.buildPrompt(text)
    const systemMessage = 'You are a text analysis expert. Always respond with valid JSON only.'
    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt },
    ]
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'system',
      content: systemMessage,
    })
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'user',
      content: prompt,
    })
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw Errors.cutModelError(`OpenAI API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'assistant',
      content,
      tokens: data.usage?.total_tokens,
      metadata: { model: modelName },
    })

    return this.parseCutPoints(content)
  }

  /**
   * 使用 Anthropic 分析
   */
  private async analyzeWithAnthropic(text: string, modelName: string, apiKey: string, sessionId: number): Promise<CutPoint[]> {
    const prompt = this.buildPrompt(text)
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'user',
      content: prompt,
    })
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw Errors.cutModelError(`Anthropic API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const content = data.content[0]?.text
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'assistant',
      content,
      metadata: { model: modelName },
    })

    return this.parseCutPoints(content)
  }

  /**
   * 使用自定义端点分析
   */
  private async analyzeWithCustom(text: string, modelName: string, baseUrl: string, apiKey: string | null | undefined, sessionId: number): Promise<CutPoint[]> {
    const prompt = this.buildPrompt(text)
    const systemMessage = 'You are a text analysis expert. Always respond with valid JSON only.'
    const messages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt },
    ]
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'system',
      content: systemMessage,
    })
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'user',
      content: prompt,
    })
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        messages,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw Errors.cutModelError(`Custom API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content
    
    await this.sessionService.addMessage({
      sessionId,
      role: 'assistant',
      content,
      tokens: data.usage?.total_tokens,
      metadata: { model: modelName },
    })

    return this.parseCutPoints(content)
  }

  /**
   * 构建提示词
   */
  private buildPrompt(text: string): string {
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

  /**
   * 解析切割点
   */
  private parseCutPoints(response: string): CutPoint[] {
    let jsonStr = response.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr)
    
    if (!parsed.cutPoints || !Array.isArray(parsed.cutPoints)) {
      throw Errors.cutModelError('Invalid response format: missing cutPoints array')
    }

    return parsed.cutPoints.map((point: any) => ({
      index: Number(point.index),
      reason: point.reason,
    }))
  }

  /**
   * 获取当前模型信息
   */
  async getModelInfo(): Promise<{ provider: string; model: string }> {
    const { model, provider } = await this.getDefaultModel()
    return {
      provider: provider.name,
      model: model.displayName || model.name,
    }
  }

  /**
   * 清除模型缓存
   */
  clearCache(): void {
    this.modelCache.clear()
  }
}
