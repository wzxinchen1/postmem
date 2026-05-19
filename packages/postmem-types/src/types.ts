import type { ModelType, ConversationStatus, MessageRole, SearchSource, SSEEventType, ErrorCode } from './enums'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: ApiError
}

export interface ApiError {
  code: ErrorCode
  message: string
  details?: string
}

export interface ErrorResponse {
  success: false
  error: ApiError
}

export interface MemoryMetadata {
  cutModel?: string
  messageId?: string
  role?: string
  [key: string]: unknown
}

export interface SearchResult {
  id: number
  title: string
  content: string
  score: number
  topicId: number | null
  metadata: MemoryMetadata
  source: SearchSource
  context?: {
    prev: string[]
    next: string[]
  }
}

export interface ListItem {
  id: number
  title: string
  content: string
  topicId: number | null
  metadata: MemoryMetadata
  createdAt: string
}

export interface Stats {
  kbId?: number
  kbName?: string
  total: number
  lastUpdated?: string
}

export interface IngestMessage {
  id: string
  role: MessageRole
  content: string
}

export interface IngestTextRequest {
  kbId: number
  content: string
}

export interface IngestMessagesRequest {
  kbId: number
  messages: IngestMessage[]
}

export interface IngestTextResponse {
  count: number
  memoryIds: number[]
  topicsInvolved?: string[]
}

export interface SearchRequest {
  kbId: number
  query: string
  top_k?: number
  context_window?: number
}

export interface ListRequest {
  kbId: number
  page?: number
  limit?: number
}

export interface DeleteRequest {
  id: number
}

export interface StatsRequest {
  kbId?: number
}

export interface Vendor {
  id: number
  name: string
  url: string
  chatModelClass?: string | null
  embeddingModelClass?: string | null
  factoryCode?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Provider {
  id: number
  name: string
  vendorId: number
  vendor?: Vendor
  apiKey?: string
  baseUrl: string
  config: Record<string, unknown>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Model {
  id: number
  providerId: number
  name: string
  displayName?: string
  modelType: ModelType
  config: Record<string, unknown>
  isActive: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateProviderRequest {
  name: string
  vendorId: number
  apiKey?: string
  baseUrl: string
  config?: Record<string, unknown>
  isActive?: boolean
}

export interface UpdateProviderRequest {
  name?: string
  vendorId?: number
  apiKey?: string
  baseUrl?: string
  config?: Record<string, unknown>
  isActive?: boolean
}

export interface CreateVendorRequest {
  name: string
  chatModelClass?: string
  embeddingModelClass?: string
  factoryCode?: string
  isActive?: boolean
}

export interface UpdateVendorRequest {
  name?: string
  chatModelClass?: string
  embeddingModelClass?: string
  factoryCode?: string
  isActive?: boolean
}

export interface CreateModelRequest {
  providerId: number
  name: string
  displayName?: string
  modelType: ModelType
  config?: Record<string, unknown>
  isActive?: boolean
  isDefault?: boolean
}

export interface UpdateModelRequest {
  name?: string
  displayName?: string
  modelType?: ModelType
  config?: Record<string, unknown>
  isActive?: boolean
  isDefault?: boolean
}

export interface AppSettings {
  maxContentLength: number
  defaultTopK: number
  defaultContextWindow: number
  defaultPageSize: number
}

export interface CreateKBRequest {
  name: string
  description?: string
}

export interface KnowledgeBaseInfo {
  id: number
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface ProviderTreeNode {
  id: number
  name: string
  vendorName: string
  baseUrl: string
  isActive: boolean
  models: ModelTreeNode[]
}

export interface ModelTreeNode {
  id: number
  name: string
  displayName: string
  modelType: ModelType
  isDefault: boolean
  isActive: boolean
}

export interface Conversation {
  id: number
  kbId?: number
  modelType: ModelType
  modelName: string
  provider: string
  status: ConversationStatus
  error?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  messages?: ChatMessage[]
}

export interface ChatMessage {
  id: number
  conversationId: number
  role: MessageRole
  content: string
  tokens: number
  totalTokens: number
  reasoningTokens?: number
  memoried: boolean
  metadata: Record<string, unknown>
  createdAt: string
}

export interface ChatCompletionRequest {
  messages: ChatMessageInput[]
  conversationId?: number
  newConversation?: boolean
  regenerateMessageId?: number
  modelId: number
  kbId: number
}

export interface ChatMessageInput {
  id: string
  content: string
}

export interface ChatCompletionResponse {
  success: boolean
  conversationId?: number
}

export interface SSEEvent<T = unknown> {
  type: SSEEventType
  message?: string
  data?: T
}
