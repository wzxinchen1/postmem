/**
 * SiliconFlow 厂商 - 自定义工厂（支持图片识别）
 */
const factoryCode = `const { BaseChatModel } = require('@langchain/core/language_models/chat_models')
const { AIMessage, AIMessageChunk } = require('@langchain/core/messages')
const { ChatGenerationChunk } = require('@langchain/core/outputs')

class SiliconFlowChatModel extends BaseChatModel {
  constructor(params) {
    super(params)
    this.modelName = params.model
    this.apiKey = params.apiKey
    this.baseUrl = params.baseUrl || 'https://api.siliconflow.cn/v1'
    this.maxTokens = params.config?.maxTokens
    this.temperature = params.config?.temperature ?? 1
    this.capabilities = params.config?.capabilities || []
    this.reasoning = params.config?.reasoning
    this.reasoningEffort = params.config?.reasoningEffort
  }

  _llmType() {
    return 'siliconflow'
  }

  _buildMessages(messages) {
    return messages.map(m => {
      const role = m._getType()
      if (role === 'system') return { role: 'system', content: m.content }
      if (role === 'ai') return { role: 'assistant', content: m.content }
      if (role === 'human') {
        if (Array.isArray(m.content)) {
          if (this.capabilities.includes('vision')) {
            return { role: 'user', content: m.content }
          }
          const textParts = m.content.filter(c => c.type === 'text')
          return { role: 'user', content: textParts.map(c => c.text).join('\\n') }
        }
        return { role: 'user', content: m.content }
      }
      if (role === 'tool') return { role: 'tool', content: m.content }
      return { role: 'user', content: String(m.content) }
    })
  }

  async _generate(messages, options) {
    const body = {
      model: this.modelName,
      messages: this._buildMessages(messages),
      stream: false,
      temperature: this.temperature,
    }
    if (this.maxTokens) body.max_tokens = this.maxTokens
    if (this.reasoning === false) body.thinking = { type: 'disabled' }
    if (this.reasoning === true && this.reasoningEffort && this.reasoningEffort !== 'none') body.thinking = { type: 'enabled' }

    const response = await fetch(this.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error('SiliconFlow API error ' + response.status + ': ' + text)
    }

    const data = await response.json()
    const choice = data.choices[0]
    const msg = choice.message
    const usage = data.usage || {}

    return {
      generations: [{
        text: msg.content || '',
        message: new AIMessage({
          content: msg.content || '',
          response_metadata: choice.finish_reason
            ? { finish_reason: choice.finish_reason }
            : undefined,
          usage_metadata: {
            input_tokens: usage.prompt_tokens || 0,
            output_tokens: usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0,
          },
        }),
      }],
      llmOutput: { token_usage: data.usage },
    }
  }

  async *_streamResponseChunks(messages, options, runManager) {
    const body = {
      model: this.modelName,
      messages: this._buildMessages(messages),
      stream: true,
      temperature: this.temperature,
    }
    if (this.maxTokens) body.max_tokens = this.maxTokens
    if (this.reasoning === false) body.thinking = { type: 'disabled' }
    if (this.reasoning === true && this.reasoningEffort && this.reasoningEffort !== 'none') body.thinking = { type: 'enabled' }

    const response = await fetch(this.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error('SiliconFlow API error ' + response.status + ': ' + text)
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let finalUsage = null
    let finalFinishReason = null

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        if (trimmed === 'data: [DONE]') {
          if (finalUsage) {
            yield new ChatGenerationChunk({
              message: new AIMessageChunk({
                content: '',
                usage_metadata: {
                  input_tokens: finalUsage.prompt_tokens || 0,
                  output_tokens: finalUsage.completion_tokens || 0,
                  total_tokens: finalUsage.total_tokens || 0,
                },
                response_metadata: finalFinishReason
                  ? { finish_reason: finalFinishReason }
                  : undefined,
              }),
            })
          }
          return
        }

        try {
          const data = JSON.parse(trimmed.slice(6))
          const choice = data.choices?.[0]
          const delta = choice?.delta
          if (!delta) continue

          if (data.usage) finalUsage = data.usage
          if (choice.finish_reason) finalFinishReason = choice.finish_reason

          if (delta.content) {
            yield new ChatGenerationChunk({
              message: new AIMessageChunk({ content: delta.content }),
            })
          }
        } catch (_) {}
      }
    }
  }
}

module.exports = {
  createModel(params) {
    return new SiliconFlowChatModel(params)
  }
}`

export const siliconflow = {
  name: 'SiliconFlow',
  url: 'https://api.siliconflow.cn/v1',
  chatModelClass: null,
  embeddingModelClass: 'OpenAIEmbeddings',
  factoryCode: Buffer.from(factoryCode).toString('base64'),
  isActive: true,
}
