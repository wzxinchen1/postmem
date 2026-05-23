import { asValue, asClass } from 'awilix'
import type { ChatSettingInfo, Model } from '../../src/types'
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
      searchSummaryConcurrency: 2,
      chunkCharRange: '200-500',
      userProfile: null,
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

/**
 * Real-LLM 模式下的 chatSettingProvider：
 * 从数据库读取真实设置，再叠加 mock store 中的测试控制字段。
 * 这样 searchSummaryConcurrency、searchLinkCount 等走真实数据库值，
 * 而 memorySearchDisabled、webSearchDisabled、memoryContextThreshold 等仍可由测试控制。
 */
const realLLMChatSettingProvider: IChatSettingProvider = {
  async get() {
    const prisma = createMockPrisma()
    try {
      const dbSetting = await prisma.chatSetting.findFirst()
      const store = getStore()
      if (!dbSetting) {
        // 数据库无记录时 fallback 到 mock store
        return { ...store }
      }
      // 以数据库值为基础，叠加 mock store 中的测试控制字段
      return {
        ...dbSetting,
        // 以下字段由测试 mock 控制，不使用数据库值
        memoryContextThreshold: store.memoryContextThreshold,
        chunkCharRange: store.chunkCharRange,
        memorySearchDisabled: store.memorySearchDisabled,
        webSearchDisabled: store.webSearchDisabled,
      } as ChatSettingInfo
    } finally {
      await prisma.$disconnect()
    }
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

// ─── Mock ModelService（控制 hasVisionCapability） ───────────
//
// get() 从真实数据库查模型，但可动态覆盖 capabilities 中的 vision 能力。
// getDefaultByCapability 走真实 DB 查询，确保 setup 阶段能获取默认模型。
// 其余方法不感知 hasVision 控制。

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client/client'
import type { ModelCapability } from '../../src/types'

const MODEL_STORE_KEY = Symbol.for('postmem:test:model-store')

interface ModelStore {
  hasVision: boolean
}

function getModelStore(): ModelStore {
  if (!(globalThis as any)[MODEL_STORE_KEY]) {
    ;(globalThis as any)[MODEL_STORE_KEY] = { hasVision: true }
  }
  return (globalThis as any)[MODEL_STORE_KEY]
}

/** 设置 mock 模型是否报告 vision 能力（影响 recognizeImage 节点是否跳过识图） */
export function setModelHasVision(hasVision: boolean): void {
  getModelStore().hasVision = hasVision
}

function createMockPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

async function fetchModelBase(id: string) {
  const prisma = createMockPrisma()
  try {
    const model = await prisma.model.findUnique({
      where: { id },
      include: { provider: true },
    })
    if (!model) return null
    return model as unknown as Model
  } finally {
    await prisma.$disconnect()
  }
}

async function fetchDefaultModel(capability: string) {
  const prisma = createMockPrisma()
  try {
    const model = await prisma.model.findFirst({
      where: { isDefault: true, isActive: true, capabilities: { has: capability } },
      include: { provider: true },
    })
    if (!model) return null
    return model as unknown as Model
  } finally {
    await prisma.$disconnect()
  }
}

const mockModelServiceObj = {
  get: async (id: string) => {
    const base = await fetchModelBase(id)
    if (!base) return null
    const hasVision = getModelStore().hasVision
    const capabilities = hasVision
      ? [...new Set([...base.capabilities, 'vision' as ModelCapability])]
      : base.capabilities.filter(c => c !== 'vision')
    return { ...base, capabilities } as Model
  },
  list: async () => [],
  listByProvider: async () => [],
  getDefaultByCapability: async (capability: string) => {
    return fetchDefaultModel(capability)
  },
  create: async () => { throw new Error('mock: create not supported') },
  update: async () => { throw new Error('mock: update not supported') },
  delete: async () => { throw new Error('mock: delete not supported') },
  exists: async () => false,
}

/**
 * 创建测试 DI 覆盖。
 *
 * 默认 (realLLM=false) 全部使用 mock，避免外部依赖。
 * 传 realLLM=true 时仅 mock 设置和模型能力，
 * LLM 和搜索服务走真实实现（需配置好 API key、TAVILY_API_KEY 和默认模型）。
 */
export function createTestOverrides(realLLM = false) {
  const overrides: Record<string, ReturnType<typeof asValue> | ReturnType<typeof asClass>> = {
    // chatSettingService:
    //   mock 模式 — 全部走 mock store，避免数据库依赖
    //   real-LLM 模式 — 从数据库读取真实设置，仅测试控制字段（阈值、搜索开关）走 mock
    chatSettingService: asValue(realLLM ? realLLMChatSettingProvider : mockChatSettingProvider),
    // modelService: mock，支持动态切换 hasVisionCapability
    modelService: asValue(mockModelServiceObj),
  }

  if (!realLLM) {
    // Mock 模式：替换搜索和 LLM 相关服务为 mock，避免外部 API 调用
    overrides.searchService = asClass(MockSearchService as any).scoped()
    overrides.chatModelFactory = asValue(mockChatModelFactoryObj)
    overrides.llmResilienceService = asValue(mockLLMResilienceService)
    overrides.agentService = asValue(mockAgentServiceObj)
    overrides.vendorService = asValue(mockVendorServiceObj)
  }

  return overrides
}