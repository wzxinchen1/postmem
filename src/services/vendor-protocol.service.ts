import { VM } from 'vm2'
import type { VendorFactory } from '@/src/types'

const CHAT_MODEL_CLASSES: Record<string, new (...args: unknown[]) => unknown> = {
  ChatOpenAI: require('@langchain/openai').ChatOpenAI,
  ChatAnthropic: require('@langchain/anthropic').ChatAnthropic,
  ChatOllama: require('@langchain/ollama').ChatOllama,
}

const EMBEDDING_MODEL_CLASSES: Record<string, new (...args: unknown[]) => unknown> = {
  OpenAIEmbeddings: require('@langchain/openai').OpenAIEmbeddings,
  OllamaEmbeddings: require('@langchain/ollama').OllamaEmbeddings,
}

export function createModel(vendor: {
  name?: string
  chatModelClass?: string | null
  embeddingModelClass?: string | null
  factoryCode?: string | null
}, params: {
  model: string
  modelType: 'chat' | 'embedding'
  apiKey?: string
  baseUrl?: string
  config?: Record<string, unknown>
}) {
  const classKey = params.modelType === 'chat' ? vendor.chatModelClass : vendor.embeddingModelClass

  if (classKey) {
    const classMap = params.modelType === 'chat' ? CHAT_MODEL_CLASSES : EMBEDDING_MODEL_CLASSES
    const ModelClass = classMap[classKey]
    if (!ModelClass) {
      throw new Error(`Unknown ${params.modelType} model class: ${classKey}`)
    }

    if (params.modelType === 'chat') {
      if (classKey === 'ChatOpenAI') {
        return new ModelClass({
          model: params.model,
          apiKey: params.apiKey,
          configuration: { baseURL: params.baseUrl },
          ...params.config,
        })
      }
      if (classKey === 'ChatAnthropic') {
        return new ModelClass({
          model: params.model,
          apiKey: params.apiKey,
          clientOptions: { baseURL: params.baseUrl },
          ...params.config,
        })
      }
      if (classKey === 'ChatOllama') {
        return new ModelClass({
          model: params.model,
          baseUrl: params.baseUrl,
          ...params.config,
        })
      }
    }

    if (params.modelType === 'embedding') {
      if (classKey === 'OpenAIEmbeddings') {
        return new ModelClass({
          model: params.model,
          apiKey: params.apiKey,
          configuration: { baseURL: params.baseUrl },
          ...params.config,
        })
      }
      if (classKey === 'OllamaEmbeddings') {
        return new ModelClass({
          model: params.model,
          baseUrl: params.baseUrl,
          ...params.config,
        })
      }
    }

    return new ModelClass({ ...params })
  }

  if (vendor.factoryCode) {
    const factory = executeFactoryCode(vendor.factoryCode)
    return factory.createModel({ ...params })
  }

  throw new Error(`Vendor "${vendor.name ?? 'unknown'}" (${params.modelType}) must have either modelClass or factoryCode`)
}

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
      if (name === '@langchain/openai') {
        return require('@langchain/openai')
      }
      if (name === '@langchain/anthropic') {
        return require('@langchain/anthropic')
      }
      if (name === '@langchain/ollama') {
        return require('@langchain/ollama')
      }
      throw new Error('Unknown module: ' + name)
    }
  `)

  const result = vm.run(code) as Record<string, unknown>

  if (!result || typeof result.createModel !== 'function') {
    throw new Error('Factory code must export an object with createModel method')
  }

  return result as unknown as VendorFactory
}
