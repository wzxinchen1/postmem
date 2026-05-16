/**
 * 厂商种子数据 - 系统支持的提供商选项
 * 前端下拉框直接读此表（/api/vendors）
 * 用户基于这些选项创建自己的 Provider 实例
 */
export const vendors = [
  // === 国际主流 ===
  {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: 'Anthropic Claude',
    url: 'https://api.anthropic.com',
    chatModelClass: 'ChatAnthropic',
    factoryCode: null,
    isActive: true,
  },
  {
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: 'Meta Llama',
    url: 'https://api.meta.ai',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: 'Mistral AI',
    url: 'https://api.mistral.ai/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },

  // === 国内大模型厂商 ===
  {
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

    return {
      generations: [{
        text: msg.content || '',
        message: new AIMessage({
          content: msg.content || '',
          additional_kwargs: additionalKwargs,
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
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        if (trimmed === 'data: [DONE]') return

        try {
          const data = JSON.parse(trimmed.slice(6))
          const delta = data.choices?.[0]?.delta
          if (!delta) continue

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
  },
  {
    name: '月之暗面 Kimi',
    url: 'https://api.moonshot.cn/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: '智谱 GLM',
    url: 'https://open.bigmodel.cn/api/paas/v4',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: '阿里通义千问',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: '字节豆包',
    url: 'https://ark.cn-beijing.volces.com/api/v3',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: '百度文心一言',
    url: 'https://qianfan.baidubce.com/v2',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: '腾讯混元',
    url: 'https://api.hunyuan.cloud.tencent.com/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: '讯飞星辰',
    url: 'https://spark-api.xf-yun.com/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },

  // === 云服务商 AI 平台 ===
  {
    name: 'Azure OpenAI',
    url: 'https://<resource>.openai.azure.com',
    chatModelClass: 'AzureChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: '阿里云百炼',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: '腾讯云 TokenHub',
    url: 'https://api.tokenhub.tencent.com/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },

  // === 模型聚合/中转平台 ===
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: 'n1n.ai',
    url: 'https://api.n1n.ai/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },
  {
    name: 'SiliconFlow',
    url: 'https://api.siliconflow.cn/v1',
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
    isActive: true,
  },

  // === 本地部署 ===
  {
    name: 'Ollama 本地',
    url: 'http://localhost:11434',
    chatModelClass: 'ChatOllama',
    embeddingModelClass: 'OllamaEmbeddings',
    factoryCode: null,
    isActive: true,
  },
]
