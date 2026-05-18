export class PostMemError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`PostMem API error: ${status} ${body}`)
    this.name = 'PostMemError'
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
  | { type: 'status'; status: StreamStatus }
  | { type: 'messageId'; role: 'user' | 'assistant'; id: string }
  | { type: 'error'; message: string }
  | { type: 'done'; reason?: DoneReason; error?: string; userTokens?: number; userTotalTokens?: number; totalTokens?: number; completionTokens?: number }

export interface ChatMessageInput {
  id: string
  content: string
}

export interface ChatRequest {
  messages: ChatMessageInput[]
  conversationId?: string
  newConversation?: boolean
  regenerateMessageId?: string
  modelId: string
  kbId: string
  enableThinking?: boolean
  thinkingEffort?: ThinkingEffort
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'system' | 'user' | 'assistant'
  content: string
  tokens: number
  totalTokens: number
  memoried: boolean
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
}

export interface PostMemConfig {
  baseUrl: string
  requestTimeout?: number
  streamTimeout?: number
}
