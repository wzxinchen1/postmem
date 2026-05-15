/**
 * 提供商种子数据
 * 每个提供商关联一个厂商，并配置 API Key 和 Base URL
 */
export const providers = [
  {
    name: 'OpenAI Official',
    vendorName: 'openai',
    apiKey: null,
    baseUrl: 'https://api.openai.com/v1',
    config: {},
    isActive: true,
  },
  {
    name: 'Anthropic Official',
    vendorName: 'anthropic',
    apiKey: null,
    baseUrl: 'https://api.anthropic.com',
    config: {},
    isActive: true,
  },
  {
    name: 'Ollama Local',
    vendorName: 'ollama',
    apiKey: null,
    baseUrl: 'http://localhost:11434',
    config: {},
    isActive: true,
  },
  {
    name: 'DeepSeek Official',
    vendorName: 'deepseek',
    apiKey: null,
    baseUrl: 'https://api.deepseek.com',
    config: {},
    isActive: true,
  },
]
