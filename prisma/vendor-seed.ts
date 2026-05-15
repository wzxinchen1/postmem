/**
 * 厂商种子数据
 * - 有现成 LangChain 类的：只填 chatModelClass
 * - 需要自定义的：填 factoryCode
 */
export const vendors = [
  {
    name: 'openai',
    chatModelClass: 'ChatOpenAI',
    factoryCode: null,
    isActive: true,
  },
  {
    name: 'anthropic',
    chatModelClass: 'ChatAnthropic',
    factoryCode: null,
    isActive: true,
  },
  {
    name: 'ollama',
    chatModelClass: 'ChatOllama',
    factoryCode: null,
    isActive: true,
  },
  {
    name: 'deepseek',
    chatModelClass: 'ChatOpenAI',
    factoryCode: null,
    isActive: true,
  },
]
