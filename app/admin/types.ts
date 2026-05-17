// API 响应类型定义
export interface IngestResponse {
  success: boolean
  data?: {
    count: number
    memoryIds: string[]
    memorizedMessageIds?: string[]
  }
  error?: {
    code: string
    message: string
  }
}

export interface IngestProgressEvent {
  type: 'status' | 'progress' | 'chunk_detail' | 'complete' | 'error'
  message?: string
  data?: {
    current?: number
    total?: number
    title?: string
    action?: 'insert' | 'skip' | 'merge' | 'new'
    count?: number
    memoryIds?: string[]
    topicsInvolved?: string[]
    message?: string
    code?: string
  }
}

export type SearchSource = 'dense' | 'sparse' | 'hybrid'

export interface SearchResult {
  id: string
  content: string
  score: number
  topicId: string | null
  source: SearchSource
  metadata?: {
    cutModel?: string
    messageId?: string
    role?: string
  }
  context?: {
    prev: string[]
    next: string[]
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
  id: string
  content: string
  topicId: string | null
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
    id: string
  }
  error?: {
    code: string
    message: string
  }
}

export interface StatsData {
  kbId?: string
  kbName?: string
  total?: number
  lastUpdated?: string
  kbNames?: Array<{
    kbId: string
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
  id: string
  name: string
  description?: string
  total: number
  lastUpdated?: string
}
