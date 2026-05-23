import type { VendorFactory } from '@/src/types'
import { AppError } from '@/src/lib/errors'

  const MODULES: Record<string, unknown> = {
    '@langchain/core/language_models/chat_models': require('@langchain/core/language_models/chat_models'),
    '@langchain/core/messages': require('@langchain/core/messages'),
    '@langchain/core/outputs': require('@langchain/core/outputs'),
    '@langchain/openai': require('@langchain/openai'),
    '@langchain/anthropic': require('@langchain/anthropic'),
    '@langchain/ollama': require('@langchain/ollama'),
  }

const CLASS_REGISTRY: Record<string, { pkg: string; className: string }> = {
  ChatOpenAI: { pkg: '@langchain/openai', className: 'ChatOpenAI' },
  ChatAnthropic: { pkg: '@langchain/anthropic', className: 'ChatAnthropic' },
  ChatOllama: { pkg: '@langchain/ollama', className: 'ChatOllama' },
  OpenAIEmbeddings: { pkg: '@langchain/openai', className: 'OpenAIEmbeddings' },
  OllamaEmbeddings: { pkg: '@langchain/ollama', className: 'OllamaEmbeddings' },
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
    const registryEntry = CLASS_REGISTRY[classKey]
    if (!registryEntry) {
      throw new AppError('VENDOR_PROTOCOL_UNKNOWN_MODEL_CLASS', { modelType: params.modelType, classKey })
    }
    const pkgModule = MODULES[registryEntry.pkg] as Record<string, unknown>
    const ModelClass = pkgModule[registryEntry.className] as new (...args: unknown[]) => unknown

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
    const code = Buffer.from(vendor.factoryCode, 'base64').toString('utf-8')
    const factory = executeFactoryCode(code)
    return factory.createModel({ ...params })
  }

  throw new AppError('VENDOR_PROTOCOL_NO_MODEL_CONFIG', { vendorName: vendor.name ?? 'unknown', modelType: params.modelType })
}

function executeFactoryCode(code: string): VendorFactory {
  const moduleNames = Object.keys(MODULES)
  const moduleValues = Object.values(MODULES)

  const preamble = [
    "var module = { exports: {} }",
    "var exports = module.exports",
    "var require = function(name) {",
    "  var idx = __moduleNames.indexOf(name)",
    "  if (idx === -1) throw new Error('Unknown module: ' + name)",
    "  return __modules[idx]",
    "}",
  ].join('\n')

  const fullCode = preamble + '\n' + code + '\nreturn module.exports'

  let fn: (...args: unknown[]) => unknown
  try {
    fn = new Function('__moduleNames', '__modules', fullCode) as (...args: unknown[]) => unknown
  } catch (err) {
    const syntaxError = err as Error
    const lines = code.split('\n')
    const match = syntaxError.message.match(/position (\d+)/)
    let posInfo = ''
    if (match) {
      const pos = Number(match[1]) - preamble.length - 1
      let offset = 0
      for (let i = 0; i < lines.length; i++) {
        if (offset + lines[i].length >= pos) {
          posInfo = '\n  at line ' + (i + 1) + ' col ' + (pos - offset) + ': ' + lines[i].trim().slice(0, 80)
          break
        }
        offset += lines[i].length + 1
      }
    }

    const nonAscii = [...code].filter((c) => c.charCodeAt(0) > 127)
    const debugInfo = [
      'code length: ' + code.length,
      'lines: ' + lines.length,
      'first 100: ' + JSON.stringify(code.slice(0, 100)),
      'last 100: ' + JSON.stringify(code.slice(-100)),
      'non ascii chars: ' + (nonAscii.length > 0 ? nonAscii.map((c) => c.charCodeAt(0).toString(16)).join(',') : 'none'),
    ].join(' | ')

    throw new AppError('VENDOR_FACTORY_CODE_SYNTAX_ERROR', {
      detail: syntaxError.message + posInfo + '\n[DEBUG] ' + debugInfo,
    })
  }

  let result: Record<string, unknown>
  try {
    result = fn(moduleNames, moduleValues) as Record<string, unknown>
  } catch (err) {
    throw new AppError('VENDOR_FACTORY_CODE_EXECUTION_ERROR', {
      detail: (err as Error).message,
    })
  }

  if (!result || typeof result.createModel !== 'function') {
    throw new AppError('VENDOR_FACTORY_CODE_INVALID_METHOD')
  }

  return result as unknown as VendorFactory
}
