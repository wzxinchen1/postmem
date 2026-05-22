export interface TopicMatchResult {
  action: 'select' | 'create'
  topicName?: string
  reason: string
}

export interface TopicCreateInfo {
  name: string
  description: string
}

/**
 * 批量主题规划结果 - 单个切片的主题分配
 */
export interface ChunkTopicPlan {
  index: number
  action: 'select' | 'create'
  topicName?: string
  newTopicName?: string
  reason?: string
}

/**
 * 带标题的切分片段
 */
export interface TitledChunk {
  index: number
  title: string
  content: string
}

/**
 * 批量主题规划完整结果
 */
export interface BatchTopicPlan {
  plans: ChunkTopicPlan[]
}

/**
 * 内存片段元数据
 */
export interface MemoryMetadata {
  cutModel?: string
  messageId?: string
  role?: string
  [key: string]: unknown
}

/**
 * 内存片段
 */
export interface Memory {
  id: string
  kbId: string
  topicId: string | null
  title: string
  content: string
  embedding: number[]
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
export type SearchSource = 'dense' | 'sparse' | 'hybrid'

export interface SearchResult {
  id: string
  title: string
  content: string
  score: number
  topicId: string | null
  metadata: MemoryMetadata
  source: SearchSource
  context?: {
    prev: string[]
    next: string[]
  }
}

/**
 * 列表项
 */
export interface ListItem {
  id: string
  title: string
  content: string
  topicId: string | null
  metadata: MemoryMetadata
  createdAt: Date
}

/**
 * 统计信息
 */
export interface Stats {
  kbId?: string
  kbName?: string
  total: number
  lastUpdated?: Date
}

/**
 * 入库消息
 */
export interface IngestMessage {
  id: string
  role: MessageRole
  content: string
}

/**
 * 纯文本入库请求
 */
export interface IngestTextRequest {
  kbId: string
  content: string
}

/**
 * 消息列表入库请求
 */
export interface IngestMessagesRequest {
  kbId: string
  messages: IngestMessage[]
}

/**
 * 纯文本入库响应
 */
export interface IngestTextResponse {
  count: number
  memoryIds: string[]
  topicsInvolved?: string[]
}

export interface TopicInfo {
  id: string
  kbId: string
  name: string
  description: string
  createdAt: Date
  updatedAt: Date
}

/**
 * 消息列表入库响应
 */
export interface IngestMessagesResponse {
  count: number
  memoryIds: string[]
  memorizedMessageIds: string[]
}

/**
 * 检索请求
 */
export interface SearchRequest {
  kbId: string
  query: string
  top_k?: number
  context_window?: number
}

/**
 * 列表请求
 */
export interface ListRequest {
  kbId: string
  page?: number
  limit?: number
}

/**
 * 删除请求
 */
export interface DeleteRequest {
  id: string
}

/**
 * 统计请求
 */
export interface StatsRequest {
  kbId?: string
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
 * 消息分组 - 表示一组在说同一件事的消息
 */
export interface MessageGroup {
  messageIds: string[]
  summary?: string
  isComplete: boolean
}

/**
 * 提供商类型
 */
export type ProviderType = 'openai' | 'anthropic' | 'local' | 'custom'

/**
 * 模型类型
 */
export type ModelCapability = 'chat' | 'embedding' | 'vision' | 'reasoning'

/**
 * 厂商工厂接口 - 创建 LangChain 模型实例（Chat 或 Embedding）
 */
export interface VendorFactory {
  createModel(params: {
    model: string
    modelType: 'chat' | 'embedding'
    apiKey?: string
    baseUrl?: string
    config?: Record<string, unknown>
  }): unknown
}

/**
 * 厂商
 */
export interface Vendor {
  id: string
  name: string
  url: string
  chatModelClass?: string | null
  embeddingModelClass?: string | null
  factoryCode?: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * 提供商
 */
export interface Provider {
  id: string
  name: string
  vendorId: string
  vendor?: Vendor
  apiKey?: string
  baseUrl: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * 模型
 */
export interface Model {
  id: string
  providerId: string
  name: string
  displayName?: string
  capabilities: ModelCapability[]
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
  vendorId: string
  apiKey?: string
  baseUrl: string
  isActive?: boolean
}

/**
 * 更新提供商请求
 */
export interface UpdateProviderRequest {
  name?: string
  vendorId?: string
  apiKey?: string
  baseUrl?: string
  isActive?: boolean
}

/**
 * 创建厂商请求
 */
export interface CreateVendorRequest {
  name: string
  chatModelClass?: string
  embeddingModelClass?: string
  factoryCode?: string
  isActive?: boolean
}

/**
 * 更新厂商请求
 */
export interface UpdateVendorRequest {
  name?: string
  chatModelClass?: string
  embeddingModelClass?: string
  factoryCode?: string
  isActive?: boolean
}

/**
 * 创建模型请求
 */
export interface CreateModelRequest {
  providerId: string
  name: string
  displayName?: string
  capabilities: ModelCapability[]
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
  capabilities?: ModelCapability[]
  config?: Record<string, unknown>
  isActive?: boolean
  isDefault?: boolean
}

/**
 * 应用设置
 */
export interface Setting {
  id: string
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
  id: string
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * 会话状态
 */
export type MessageRole = 'system' | 'user' | 'assistant'

/**
 * 聊天消息
 */
export interface ChatMessage {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  tokens: number
  totalTokens: number
  reasoningTokens?: number
  memoried: boolean
  images?: ChatMessageImage[]
  urls?: string[]
  metadata: Record<string, unknown>
  createdAt: Date
}

/**
 * 聊天消息列表结果
 */
export interface ChatMessageListResult {
  messages: ChatMessage[]
  total: number
  page: number
  limit: number
  conversationId: string
}

/**
 * 对话
 */
export interface Conversation {
  id: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  messages?: ChatMessage[]
}

/**
 * 创建对话请求
 */
export interface CreateConversationRequest {
  metadata?: Record<string, unknown>
}

/**
 * 添加聊天消息请求
 */
export interface AddChatMessageRequest {
  conversationId: string
  role: MessageRole
  content: string
  tokens?: number
  totalTokens?: number
  reasoningTokens?: number
  memoried?: boolean
  name?: string
  images?: ChatMessageImage[]
  urls?: string[]
  metadata?: Record<string, unknown>
}

/**
 * 聊天完成请求
 */
export interface ChatCompletionRequest {
  messages: ChatMessageInput[]
  conversationId?: string
  newConversation?: boolean
  regenerateMessageId?: string
  modelId: string
  kbId: string
  thinkingEffort?: ThinkingEffort
}

/**
 * 聊天消息输入
 */
export interface ChatMessageInput {
  id: string
  content: string
  images?: ChatMessageImage[]
  urls?: string[]
}

/**
 * 聊天消息图片
 */
export interface ChatMessageImage {
  url: string
  mimeType?: string
}

/**
 * 聊天完成响应
 */
export interface ChatCompletionResponse {
  success: boolean
  conversationId?: string
}

/**
 * 搜索需求分析结果
 */
export interface SearchNeedsResult {
  searchWebReason: string
  searchWebMemoryReason: string
  needSearchWeb: boolean
  webKeywords: string[]
  needSearchMemory: boolean
  memoryQuery: string | null
}

/**
 * SSE 流状态
 */
export enum StreamStatus {
  SearchingWeb = 'searchingWeb',
  SearchingMemory = 'searchingMemory',
  Summarizing = 'summarizing',
  MemoryProgress = 'memoryProgress',
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

/**
 * SSE 流事件
 */
export type StreamEvent =
  | { type: 'chunk'; content: string; model: { id: string; name: string } }
  | { type: 'thinking'; content: string }
  | { type: 'status'; status: StreamStatus; message?: string; url?: string }
  | { type: 'messageId'; role: 'user' | 'assistant'; id: string; message?: ChatMessage }
  | { type: 'error'; message: string }
  | { type: 'done'; reason?: DoneReason; error?: string; userTokens?: number; userTotalTokens?: number; totalTokens?: number; completionTokens?: number; reasoningTokens?: number }

/**
 * 网页缓存
 */
export interface WebPageInfo {
  id: string
  url: string
  title?: string
  content: string
  summary?: string | null
  keywords: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * 聊天设置
 */
export interface ChatSettingInfo {
  id: string
  memoryContextThreshold: number
  maxOutputTokens?: number | null
  searchLinkCount: number
  chunkCharRange: string
  /** @internal 测试专用：禁用搜索（不存数据库，仅 DI mock 生效） */
  searchDisabled?: boolean
  createdAt: Date
  updatedAt: Date
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
  createdAt: Date
  messages?: SessionMessage[]
}

export interface SessionMessage {
  id: string
  sessionId: string
  role: string
  content: string
  tokens: number
  metadata: Record<string, unknown>
  createdAt: Date
}

export interface CreateSessionRequest {
  kbId?: string
  modelType: string
  modelName: string
  provider: string
  metadata?: Record<string, unknown>
}

export interface AddSessionMessageRequest {
  sessionId: string
  role: string
  content: string
  tokens?: number
  metadata?: Record<string, unknown>
}

/**
 * 提供商树节点 - 提供商及其下属模型的树形结构
 */
export interface ProviderTreeNode {
  id: string
  name: string
  vendorName: string
  baseUrl: string
  isActive: boolean
  models: ModelTreeNode[]
}

/**
 * 模型树节点 - 提供商树中的模型信息
 */
export interface ModelTreeNode {
  id: string
  name: string
  displayName: string
  capabilities: ModelCapability[]
  isDefault: boolean
  isActive: boolean
}
