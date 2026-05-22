import { asValue } from 'awilix'
import type { ChatSettingInfo } from '../../src/types'
import type { IChatSettingProvider } from '../../src/interfaces/chat-setting-provider'

const STORE_KEY = Symbol.for('postmem:test:chat-settings-store')

function getStore(): ChatSettingInfo {
  if (!(globalThis as any)[STORE_KEY]) {
    ;(globalThis as any)[STORE_KEY] = {
      id: 'test-mock-setting',
      memoryContextThreshold: 9999,
      maxOutputTokens: null,
      searchLinkCount: 10,
      chunkCharRange: '200-500',
      searchDisabled: false,
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
  Object.assign(getStore(), { searchDisabled: disabled })
}

export function getSearchDisabled(): boolean {
  return getStore().searchDisabled ?? false
}

export function createTestOverrides() {
  return {
    chatSettingService: asValue(mockChatSettingProvider),
  }
}