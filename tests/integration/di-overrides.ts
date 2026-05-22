import { asValue, asClass } from 'awilix'
import type { ChatSettingInfo } from '../../src/types'
import type { IChatSettingProvider } from '../../src/interfaces/chat-setting-provider'
import { mockLLMResilienceService, mockChatModelFactoryObj, mockAgentServiceObj, mockVendorServiceObj, MockSearchService } from './mock-llm'

const STORE_KEY = Symbol.for('postmem:test:chat-settings-store')

function getStore(): ChatSettingInfo {
  if (!(globalThis as any)[STORE_KEY]) {
    ;(globalThis as any)[STORE_KEY] = {
      id: 'test-mock-setting',
      memoryContextThreshold: 9999,
      maxOutputTokens: null,
      searchLinkCount: 10,
      chunkCharRange: '200-500',
      memorySearchDisabled: false,
      webSearchDisabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  return (globalThis as any)[STORE_KEY]
}

const mockChatSettingProvider: IChatSettingProvider = {
  async get() {
    return { ...getStore() }
  },
}

export function setMockChatSetting(settings: Partial<ChatSettingInfo>): void {
  Object.assign(getStore(), settings)
}

export function setSearchDisabled(disabled: boolean): void {
  Object.assign(getStore(), { memorySearchDisabled: disabled })
}

export function getSearchDisabled(): boolean {
  return getStore().memorySearchDisabled ?? false
}

export function setWebSearchDisabled(disabled: boolean): void {
  Object.assign(getStore(), { webSearchDisabled: disabled })
}

export function getWebSearchDisabled(): boolean {
  return getStore().webSearchDisabled ?? false
}

/**
 * 创建测试 DI 覆盖。
 *
 * 默认 (realLLM=false) 全部使用 mock，避免外部依赖。
 * 传 realLLM=true 时仅 mock 搜索和设置（不调真实 Tavily），
 * LLM 相关服务走真实实现（需配置好 API key 和默认模型）。
 */
export function createTestOverrides(realLLM = false) {
  const overrides: Record<string, ReturnType<typeof asValue> | ReturnType<typeof asClass>> = {
    // chatSettingService: 允许测试中动态修改阈值/设置，两种模式都需要
    chatSettingService: asValue(mockChatSettingProvider),
    // searchService: 避免真实 Tavily API 调用，两种模式都需要
    searchService: asClass(MockSearchService as any).scoped(),
  }

  if (!realLLM) {
    // Mock 模式：替换 LLM 相关服务为固定响应
    overrides.chatModelFactory = asValue(mockChatModelFactoryObj)
    overrides.llmResilienceService = asValue(mockLLMResilienceService)
    overrides.agentService = asValue(mockAgentServiceObj)
    overrides.vendorService = asValue(mockVendorServiceObj)
  }

  return overrides
}