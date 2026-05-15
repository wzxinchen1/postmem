import { VM } from 'vm2'
import type { VendorFactory } from '@/src/types'

/**
 * LangChain ChatModel 类映射
 * 有现成类的厂商直接用类名
 */
const CHAT_MODEL_CLASSES: Record<string, new (...args: unknown[]) => unknown> = {
  ChatOpenAI: require('@langchain/openai').ChatOpenAI,
  ChatAnthropic: require('@langchain/anthropic').ChatAnthropic,
  ChatOllama: require('@langchain/ollama').ChatOllama,
}

/**
 * 创建 ChatModel 实例
 * 优先使用 chatModelClass，没有则执行 factoryCode
 */
export function createChatModel(vendor: {
  chatModelClass?: string | null
  factoryCode?: string | null
}, params: {
  model: string
  apiKey?: string
  baseUrl?: string
  config?: Record<string, unknown>
}) {
  if (vendor.chatModelClass) {
    const ChatModelClass = CHAT_MODEL_CLASSES[vendor.chatModelClass]
    if (!ChatModelClass) {
      throw new Error(`Unknown ChatModel class: ${vendor.chatModelClass}`)
    }
    
    if (vendor.chatModelClass === 'ChatOpenAI') {
      return new ChatModelClass({
        model: params.model,
        apiKey: params.apiKey,
        configuration: {
          baseURL: params.baseUrl,
        },
        ...params.config,
      })
    }
    
    if (vendor.chatModelClass === 'ChatAnthropic') {
      return new ChatModelClass({
        model: params.model,
        apiKey: params.apiKey,
        clientOptions: {
          baseURL: params.baseUrl,
        },
        ...params.config,
      })
    }
    
    if (vendor.chatModelClass === 'ChatOllama') {
      return new ChatModelClass({
        model: params.model,
        baseUrl: params.baseUrl,
        ...params.config,
      })
    }
    
    return new ChatModelClass({ ...params })
  }
  
  if (vendor.factoryCode) {
    const factory = executeFactoryCode(vendor.factoryCode)
    return factory.createChatModel(params)
  }
  
  throw new Error('Vendor must have either chatModelClass or factoryCode')
}

/**
 * 执行工厂代码，返回 VendorFactory
 */
function executeFactoryCode(code: string): VendorFactory {
  const vm = new VM({
    sandbox: {},
    timeout: 5000,
  })
  
  vm.run(`
    const require = (name) => {
      if (name === '@langchain/core/language_models/chat_models') {
        return require('@langchain/core/language_models/chat_models')
      }
      if (name === '@langchain/core/messages') {
        return require('@langchain/core/messages')
      }
      if (name === '@langchain/core/outputs') {
        return require('@langchain/core/outputs')
      }
      throw new Error('Unknown module: ' + name)
    }
  `)
  
  const result = vm.run(code) as Record<string, unknown>
  
  if (!result || typeof result.createChatModel !== 'function') {
    throw new Error('Factory code must export an object with createChatModel method')
  }
  
  return result as unknown as VendorFactory
}

