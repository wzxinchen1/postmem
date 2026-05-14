/**
 * 内存片段元数据
 */
export interface MemoryMetadata {
  cutModel?: string
  chunkSize?: number
  originalLength?: number
  [key: string]: unknown
}

/**
 * 内存片段
 */
export interface Memory {
  id: number
  kbName: string
  content: string
  embedding: number[]
  chunkIndex: number
  metadata: MemoryMetadata
  createdAt: Date
}

/**
 * 切割结果
 */
export interface ChunkResult {
  content: string
  index: number
  metadata: MemoryMetadata
}

/**
 * 检索结果
 */
export interface SearchResult {
  id: number
  content: string
  score: number
  chunkIndex: number
  metadata: MemoryMetadata
  context?: {
    prev?: string
    next?: string
  }
}

/**
 * 列表项
 */
export interface ListItem {
  id: number
  content: string
  chunkIndex: number
  metadata: MemoryMetadata
  createdAt: Date
}

/**
 * 统计信息
 */
export interface Stats {
  kbName?: string
  total: number
  lastUpdated?: Date
}

/**
 * 入库请求
 */
export interface IngestRequest {
  kbName: string
  content: string
}

/**
 * 检索请求
 */
export interface SearchRequest {
  kbName: string
  query: string
  top_k?: number
  context_window?: number
}

/**
 * 列表请求
 */
export interface ListRequest {
  kbName: string
  page?: number
  limit?: number
}

/**
 * 删除请求
 */
export interface DeleteRequest {
  id: number
}

/**
 * 统计请求
 */
export interface StatsRequest {
  kbName?: string
}

/**
 * API 响应
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: string
  }
}

/**
 * 切割模型类型
 */
export type ChunkModelType = 'local' | 'openai' | 'anthropic'

/**
 * 切割点
 */
export interface CutPoint {
  index: number
  reason?: string
}

/**
 * 提供商类型
 */
export type ProviderType = 'openai' | 'anthropic' | 'local' | 'custom'

/**
 * 模型类型
 */
export type ModelType = 'embedding' | 'chat'

/**
 * 提供商
 */
export interface Provider {
  id: number
  name: string
  type: ProviderType
  apiKey?: string
  baseUrl?: string
  config: Record<string, unknown>
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * 模型
 */
export interface Model {
  id: number
  providerId: number
  name: string
  displayName?: string
  modelType: ModelType
  config: Record<string, unknown>
  isActive: boolean
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * 创建提供商请求
 */
export interface CreateProviderRequest {
  name: string
  type: ProviderType
  apiKey?: string
  baseUrl?: string
  config?: Record<string, unknown>
  isActive?: boolean
}

/**
 * 更新提供商请求
 */
export interface UpdateProviderRequest {
  name?: string
  type?: ProviderType
  apiKey?: string
  baseUrl?: string
  config?: Record<string, unknown>
  isActive?: boolean
}

/**
 * 创建模型请求
 */
export interface CreateModelRequest {
  providerId: number
  name: string
  displayName?: string
  modelType: ModelType
  config?: Record<string, unknown>
  isActive?: boolean
  isDefault?: boolean
}

/**
 * 更新模型请求
 */
export interface UpdateModelRequest {
  name?: string
  displayName?: string
  modelType?: ModelType
  config?: Record<string, unknown>
  isActive?: boolean
  isDefault?: boolean
}

/**
 * 应用设置
 */
export interface Setting {
  id: number
  key: string
  value: Record<string, unknown>
  description?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * 默认应用设置
 */
export interface AppSettings {
  maxContentLength: number
  defaultTopK: number
  defaultContextWindow: number
  defaultPageSize: number
}

/**
 * 创建知识库请求
 */
export interface CreateKBRequest {
  name: string
  description?: string
}

/**
 * 知识库信息
 */
export interface KnowledgeBaseInfo {
  id: number
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * 会话状态
 */
export type SessionStatus = 'pending' | 'completed' | 'failed'

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant'

/**
 * 会话消息
 */
export interface SessionMessage {
  id: number
  sessionId: number
  role: MessageRole
  content: string
  tokens?: number
  metadata: Record<string, unknown>
  createdAt: Date
}

/**
 * 会话
 */
export interface Session {
  id: number
  kbName?: string
  modelType: ModelType
  modelName: string
  provider: string
  status: SessionStatus
  error?: string
  metadata: Record<string, unknown>
  createdAt: Date
  messages?: SessionMessage[]
}

/**
 * 创建会话请求
 */
export interface CreateSessionRequest {
  kbName?: string
  modelType: ModelType
  modelName: string
  provider: string
  metadata?: Record<string, unknown>
}

/**
 * 添加消息请求
 */
export interface AddMessageRequest {
  sessionId: number
  role: MessageRole
  content: string
  tokens?: number
  metadata?: Record<string, unknown>
}
