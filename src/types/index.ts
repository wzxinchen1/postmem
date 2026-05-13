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
