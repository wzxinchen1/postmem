export type ModelType = 'embedding' | 'chat'

export type ConversationStatus = 'pending' | 'completed' | 'failed'

export type MessageRole = 'system' | 'user' | 'assistant'

export type SearchSource = 'dense' | 'sparse' | 'hybrid'

export type ChunkModelType = 'local' | 'openai' | 'anthropic'

export type ProviderType = 'openai' | 'anthropic' | 'local' | 'custom'

export type SSEEventType =
  | 'message'
  | 'new_ai_message'
  | 'new_user_message'
  | 'summary_start'
  | 'summary_end'
  | 'memory_progress'
  | 'search_memory_start'
  | 'search_memory_end'
  | 'search_web_start'
  | 'search_web_end'
  | 'chat_error'
  | 'done'
  | 'keep-alive'

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'DUPLICATE_ERROR'
  | 'FETCH_ERROR'
  | 'KB_NOT_FOUND'
  | 'MEMORY_NOT_FOUND'
  | 'EMBEDDING_ERROR'
  | 'CUT_MODEL_ERROR'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR'
