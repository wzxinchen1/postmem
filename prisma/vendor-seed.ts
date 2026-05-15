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
    chatModelClass: 'ChatOpenAI',
    embeddingModelClass: 'OpenAIEmbeddings',
    factoryCode: null,
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
