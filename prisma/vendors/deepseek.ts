/**
 * DeepSeek 厂商 - 自定义工厂（支持 reasoning / thinking）
 */
const factoryCode = `const { BaseChatModel } = require('@langchain/core/language_models/chat_models')
const { AIMessage, AIMessageChunk } = require('@langchain/core/messages')
const { ChatGenerationChunk } = require('@langchain/core/outputs')

class DeepSeekChatModel extends BaseChatModel {
  constructor(params) {
    super(params)
    this.modelName = params.model
    this.apiKey = params.apiKey
    this.baseUrl = params.baseUrl || 'https://api.deepseek.com'
    this.reasoning = params.config?.reasoning !== false
    this.reasoningEffort = params.config?.reasoningEffort
    this.thinkingEnabled = params.config?.reasoning === true && params.config?.reasoningEffort !== 'none'
    this.maxTokens = params.config?.maxTokens
    this.temperature = params.config?.temperature ?? 1
  }

  _llmType() {
    return 'deepseek'
  }

  _mapReasoningEffort(effort) {
    const map = {
      none: null,
      minimal: 'high',
      low: 'high',
      medium: 'high',
      high: 'high',
      xhigh: 'max',
    }
    return map[effort] ?? 'high'
  }

  _buildThinkingBody() {
    if (!this.reasoning || !this.reasoningEffort || this.reasoningEffort === 'none') return undefined
    const mapped = this._mapReasoningEffort(this.reasoningEffort)
    const body = { type: 'enabled' }
    if (mapped) body.reasoning_effort = mapped
    return body
  }

  _buildMessages(messages) {
    return messages.map(m => {
      const role = m._getType()
      if (role === 'system') return { role: 'system', content: m.content }
      if (role === 'ai') {
        const msg = { role: 'assistant', content: m.content }
        if (m.additional_kwargs?.reasoning_content) {
          msg.reasoning_content = m.additional_kwargs.reasoning_content
        }
        return msg
      }
      if (role === 'human') return { role: 'user', content: m.content }
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
    const thinking = this._buildThinkingBody()
    if (thinking) body.thinking = thinking

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
      throw new Error('DeepSeek API error ' + response.status + ': ' + text)
    }

    const data = await response.json()
    const choice = data.choices[0]
    const msg = choice.message

    const additionalKwargs = {}
    if (this.thinkingEnabled && msg.reasoning_content) {
      additionalKwargs.reasoning_content = msg.reasoning_content
    }

    const usage = data.usage || {}
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens || 0
    return {
      generations: [{
        text: msg.content || '',
        message: new AIMessage({
          content: msg.content || '',
          additional_kwargs: additionalKwargs,
          usage_metadata: {
            input_tokens: usage.prompt_tokens || 0,
            output_tokens: usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0,
            output_token_details: {
              reasoning: reasoningTokens,
            },
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
    const thinking = this._buildThinkingBody()
    if (thinking) body.thinking = thinking

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
      throw new Error('DeepSeek API error ' + response.status + ': ' + text)
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let finalUsage = null

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        if (trimmed === 'data: [DONE]') {
          if (finalUsage) {
            const reasoningTokens = finalUsage.completion_tokens_details?.reasoning_tokens || 0
            yield new ChatGenerationChunk({
              message: new AIMessageChunk({
                content: '',
                usage_metadata: {
                  input_tokens: finalUsage.prompt_tokens || 0,
                  output_tokens: finalUsage.completion_tokens || 0,
                  total_tokens: finalUsage.total_tokens || 0,
                  output_token_details: {
                    reasoning: reasoningTokens,
                  },
                },
              }),
            })
          }
          return
        }

        try {
          const data = JSON.parse(trimmed.slice(6))
          const delta = data.choices?.[0]?.delta
          if (!delta) continue

          if (data.usage) finalUsage = data.usage

          if (this.thinkingEnabled && delta.reasoning_content) {
            yield new ChatGenerationChunk({
              message: new AIMessageChunk({
                content: delta.reasoning_content,
                additional_kwargs: { type: 'reasoning' },
              }),
            })
          }
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
    return new DeepSeekChatModel(params)
  }
}`

export const deepseek = {
  name: 'DeepSeek',
  url: 'https://api.deepseek.com',
  chatModelClass: null,
  embeddingModelClass: 'OpenAIEmbeddings',
  factoryCode: Buffer.from(factoryCode).toString('base64'),
  isActive: true,
}
