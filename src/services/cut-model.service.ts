import { Errors } from '@/src/lib/errors'
import type { ChunkModelType, CutPoint } from '@/src/types'

/**
 * 切割模型服务 - 支持本地和云端模型
 */
export class CutModelService {
  private type: ChunkModelType
  private localModel: string
  private ollamaBaseUrl: string
  private openaiApiKey?: string
  private openaiModel: string
  private anthropicApiKey?: string
  private anthropicModel: string

  constructor() {
    this.type = (process.env.CHUNK_MODEL_TYPE as ChunkModelType) || 'local'
    this.localModel = process.env.CHUNK_MODEL_NAME || 'mistral:7b'
    this.ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    this.openaiApiKey = process.env.OPENAI_API_KEY
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY
    this.anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
  }

  /**
   * 分析文本并返回切割点
   */
  async analyzeCutPoints(text: string): Promise<CutPoint[]> {
    switch (this.type) {
      case 'local':
        return await this.analyzeWithOllama(text)
      case 'openai':
        return await this.analyzeWithOpenAI(text)
      case 'anthropic':
        return await this.analyzeWithAnthropic(text)
      default:
        throw Errors.cutModelError(`Unknown chunk model type: ${this.type}`)
    }
  }

  /**
   * 使用 Ollama 本地模型分析
   */
  private async analyzeWithOllama(text: string): Promise<CutPoint[]> {
    const prompt = this.buildPrompt(text)
    
    const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.localModel,
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
    return this.parseCutPoints(data.response)
  }

  /**
   * 使用 OpenAI API 分析
   */
  private async analyzeWithOpenAI(text: string): Promise<CutPoint[]> {
    if (!this.openaiApiKey) {
      throw Errors.cutModelError('OpenAI API key not configured')
    }

    const prompt = this.buildPrompt(text)
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.openaiModel,
        messages: [
          {
            role: 'system',
            content: 'You are a text analysis expert. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw Errors.cutModelError(`OpenAI API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content
    return this.parseCutPoints(content)
  }

  /**
   * 使用 Anthropic API 分析
   */
  private async analyzeWithAnthropic(text: string): Promise<CutPoint[]> {
    if (!this.anthropicApiKey) {
      throw Errors.cutModelError('Anthropic API key not configured')
    }

    const prompt = this.buildPrompt(text)
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.anthropicModel,
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
    return this.parseCutPoints(content)
  }

  /**
   * 构建分析提示词
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
   * 解析切割点响应
   */
  private parseCutPoints(response: string): CutPoint[] {
    // 尝试提取 JSON
    let jsonStr = response.trim()
    
    // 如果响应包含 markdown 代码块，提取其中的 JSON
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    let parsed: any
    try {
      parsed = JSON.parse(jsonStr)
    } catch (error) {
      throw Errors.cutModelError(
        `Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
    
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
  getModelInfo(): { type: ChunkModelType; model: string } {
    return {
      type: this.type,
      model: this.type === 'local' 
        ? this.localModel 
        : this.type === 'openai' 
          ? this.openaiModel 
          : this.anthropicModel,
    }
  }
}