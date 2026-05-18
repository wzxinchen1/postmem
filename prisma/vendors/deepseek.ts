/**
 * DeepSeek 厂商 - 自定义工厂（支持 reasoning / thinking）
 */
export const deepseek = {
  name: 'DeepSeek',
  url: 'https://api.deepseek.com',
  chatModelClass: null,
  embeddingModelClass: 'OpenAIEmbeddings',
  factoryCode: `const { BaseChatModel } = require('@langchain/core/language_models/chat_models')
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
    this.maxTokens = params.config?.maxTokens
    this.temperature = params.config?.temperature ?? 1
  }

  _llmType() {
    return 'deepseek'
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
    if (this.reasoning) {
      body.thinking = { type: 'enabled' }
      if (this.reasoningEffort) body.thinking.reasoning_effort = this.reasoningEffort
    }

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
    if (msg.reasoning_content) {
      additionalKwargs.reasoning_content = msg.reasoning_content
    }

    const usage = data.usage || {}
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
          },
        }),
      }],
      llmOutput: { token_usage: data.usage },
    }
  }

  async *_stream(messages) {
    const body = {
      model: this.modelName,
      messages: this._buildMessages(messages),
      stream: true,
      temperature: this.temperature,
    }
    if (this.maxTokens) body.max_tokens = this.maxTokens
    if (this.reasoning) {
      body.thinking = { type: 'enabled' }
      if (this.reasoningEffort) body.thinking.reasoning_effort = this.reasoningEffort
    }

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
            yield new ChatGenerationChunk({
              message: new AIMessageChunk({
                content: '',
                usage_metadata: {
                  input_tokens: finalUsage.prompt_tokens || 0,
                  output_tokens: finalUsage.completion_tokens || 0,
                  total_tokens: finalUsage.total_tokens || 0,
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

          if (delta.reasoning_content) {
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
}`,
  isActive: true,
}
