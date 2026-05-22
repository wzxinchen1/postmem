export class PostMemError extends Error {
  public readonly isNetworkError: boolean
  public readonly isTimeout: boolean

  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`PostMem API error: ${status} ${body}`)
    this.name = 'PostMemError'
    this.isNetworkError = status === 0 && body !== 'Request timed out'
    this.isTimeout = status === 0 && body === 'Request timed out'
  }

  static network(message: string): PostMemError {
    return new PostMemError(0, message)
  }

  static timeout(): PostMemError {
    return new PostMemError(0, 'Request timed out')
  }

  static validation(message: string): PostMemError {
    return new PostMemError(400, message)
  }

  static notFound(message: string): PostMemError {
    return new PostMemError(404, message)
  }

  static serverError(message: string): PostMemError {
    return new PostMemError(500, message)
  }
}

export enum StreamStatus {
  SearchingWeb = 'searchingWeb',
  SearchingMemory = 'searchingMemory',
  Summarizing = 'summarizing',
  MemoryProgress = 'memoryProgress',
  Thinking = 'thinking',
  Recognizing = 'recognizing',
  FetchingUrl = 'fetchingUrl',
}

export enum ThinkingEffort {
  None = 'none',
  Minimal = 'minimal',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  XHigh = 'xhigh',
}

export enum DoneReason {
  Truncated = 'truncated',
  InsufficientBalance = 'insufficient_balance',
  ContentFiltered = 'content_filtered',
}

export type StreamEvent =
  | { type: 'chunk'; content: string; model: { id: string; name: string } }
  | { type: 'thinking'; content: string }
  | { type: 'status'; status: StreamStatus; url?: string }
  | { type: 'messageId'; role: 'user' | 'assistant'; id: string; message?: ChatMessage }
  | { type: 'error'; message: string }
  | { type: 'done'; reason?: DoneReason; error?: string; userTokens?: number; userTotalTokens?: number; totalTokens?: number; completionTokens?: number; reasoningTokens?: number }

export interface PostMemConfig {
  baseUrl: string
  requestTimeout?: number
  streamTimeout?: number
}

export interface ChatMessageInput {
  id: string
  content: string
  images?: ChatMessageImage[]
  urls?: string[]
}

export interface ChatMessageImage {
  url: string
  mimeType?: string
}

export interface ChatRequest {
  messages: ChatMessageInput[]
  conversationId?: string
  newConversation?: boolean
  regenerateMessageId?: string
  modelId: string
  kbId: string
  thinkingEffort?: ThinkingEffort
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'system' | 'user' | 'assistant'
  content: string
  tokens: number
  totalTokens: number
  reasoningTokens?: number
  memoried: boolean
  images?: ChatMessageImage[]
  urls?: string[]
  metadata: Record<string, unknown>
  createdAt: string
}

export interface Conversation {
  id: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ChatResult {
  conversationId: string
  fullContent: string
  error?: string
  userTokens?: number
  userTotalTokens?: number
  totalTokens?: number
  completionTokens?: number
  reasoningTokens?: number
}

export interface ChatMessageListResult {
  messages: ChatMessage[]
  total: number
  page: number
  limit: number
  conversationId: string
}

export interface PaginatedResult<T> {
  total: number
  page: number
  limit: number
  items: T[]
}

export interface KnowledgeBaseInfo {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface KnowledgeBaseStats {
  total: number
  lastUpdated?: string
}

export interface SearchSourceInfo {
  id: string
  title: string
  content: string
  score: number
  topicId: string | null
  metadata: Record<string, unknown>
  source: 'dense' | 'sparse' | 'hybrid'
  context?: {
    prev: string[]
    next: string[]
  }
}

export interface IngestMessage {
  id: string
  role: string
  content: string
}

export interface IngestTextResponse {
  count: number
  memoryIds: string[]
  topicsInvolved?: string[]
}

export interface IngestMessagesResponse {
  count: number
  memoryIds: string[]
  memorizedMessageIds: string[]
}

export interface IngestStreamEvent {
  type: 'progress' | 'complete' | 'error'
  data: Record<string, unknown>
}

export interface Vendor {
  id: string
  name: string
  url: string
  chatModelClass?: string | null
  embeddingModelClass?: string | null
  factoryCode?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
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

export interface Provider {
  id: string
  name: string
  vendorId: string
  apiKey?: string
  baseUrl: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  vendor?: Vendor
}

export interface CreateProviderRequest {
  name: string
  vendorId: string
  apiKey?: string
  baseUrl: string
  isActive?: boolean
}

export interface UpdateProviderRequest {
  name?: string
  vendorId?: string
  apiKey?: string
  baseUrl?: string
  isActive?: boolean
}

export type ModelCapability = 'chat' | 'embedding' | 'vision' | 'reasoning'

export interface Model {
  id: string
  providerId: string
  name: string
  displayName?: string
  capabilities: ModelCapability[]
  config: Record<string, unknown>
  isActive: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateModelRequest {
  providerId: string
  name: string
  displayName?: string
  capabilities: ModelCapability[]
  config?: Record<string, unknown>
  isActive?: boolean
  isDefault?: boolean
}

export interface UpdateModelRequest {
  name?: string
  displayName?: string
  capabilities?: ModelCapability[]
  config?: Record<string, unknown>
  isActive?: boolean
  isDefault?: boolean
}

export interface ProviderTreeNode {
  id: string
  name: string
  vendorName: string
  baseUrl: string
  isActive: boolean
  models: ModelTreeNode[]
}

export interface ModelTreeNode {
  id: string
  name: string
  displayName: string
  capabilities: ModelCapability[]
  isDefault: boolean
  isActive: boolean
}

export interface Session {
  id: string
  kbId?: string
  modelType: string
  modelName: string
  provider: string
  status: string
  error?: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface SessionStats {
  total: number
  byStatus?: Record<string, number>
}

export interface AppSettings {
  maxContentLength: number
  defaultTopK: number
  defaultContextWindow: number
  defaultPageSize: number
}

export interface ChatSettingInfo {
  id: string
  memoryContextThreshold: number
  maxOutputTokens?: number | null
  searchLinkCount: number
  chunkCharRange: string
  /** @internal 测试专用：禁用搜索 */
  searchDisabled?: boolean
  createdAt: string
  updatedAt: string
}

export interface ValidateModelsResult {
  models: { id: string; name: string }[]
  vendor: Vendor
}

export interface WarmupRouteEntry {
  route: string
  status: number | 'skipped'
  error?: string
}

export interface WarmupResult {
  total: number
  succeeded: number
  results: WarmupRouteEntry[]
}
