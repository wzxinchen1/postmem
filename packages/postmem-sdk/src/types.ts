export class PostMemError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`PostMem API error: ${status} ${body}`)
    this.name = 'PostMemError'
  }
}

export type StreamStatus =
  | 'searchingWeb'
  | 'searchingMemory'
  | 'summarizing'
  | 'memoryProgress'

export type StreamEvent =
  | { type: 'chunk'; content: string; model: { id: string; name: string } }
  | { type: 'status'; status: StreamStatus }
  | { type: 'messageId'; role: 'user' | 'assistant'; id: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done' }

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

export interface PostMemConfig {
  baseUrl: string
  requestTimeout?: number
  redis: {
    host: string
    port: number
    db?: number
    password?: string
  }
}
