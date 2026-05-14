// API 响应类型定义
export interface IngestResponse {
  success: boolean
  data?: {
    count: number
    memoryIds: number[]
    memorizedMessageIds?: string[]
  }
  error?: {
    code: string
    message: string
  }
}

export interface SearchResult {
  id: number
  content: string
  score: number
  chunkIndex: number
  metadata?: {
    cutModel?: string
    chunkSize?: number
    originalLength?: number
  }
  context?: {
    prev?: string
    next?: string
  }
}

export interface SearchResponse {
  success: boolean
  data?: {
    results: SearchResult[]
  }
  error?: {
    code: string
    message: string
  }
}

export interface ListItem {
  id: number
  content: string
  chunkIndex: number
  metadata: Record<string, unknown>
  createdAt: string
}

export interface ListResponse {
  success: boolean
  data?: {
    items: ListItem[]
    total: number
    page: number
    limit: number
  }
  error?: {
    code: string
    message: string
  }
}

export interface DeleteResponse {
  success: boolean
  data?: {
    deleted: boolean
    id: number
  }
  error?: {
    code: string
    message: string
  }
}

export interface StatsData {
  kbId?: number
  kbName?: string
  total?: number
  lastUpdated?: string
  kbNames?: Array<{
    kbId: number
    kbName: string
    total: number
    lastUpdated: string
  }>
}

export interface StatsResponse {
  success: boolean
  data?: StatsData
  error?: {
    code: string
    message: string
  }
}

export interface KnowledgeBaseInfo {
  id: number
  name: string
  description?: string
  total: number
  lastUpdated?: string
}
