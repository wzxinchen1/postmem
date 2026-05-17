import { StreamReader } from './stream-reader'
import { PostMemError } from './types'
import type {
  PostMemConfig,
  ChatRequest,
  ChatResult,
  ChatHandle,
  StreamEvent,
  ChatMessage,
  Conversation,
} from './types'

export class PostMemClient {
  private baseUrl: string
  private streamReader: StreamReader
  private requestTimeout: number

  constructor(config: PostMemConfig) {
    this.baseUrl = config.baseUrl
    this.requestTimeout = config.requestTimeout ?? 30_000
    this.streamReader = new StreamReader(config.redis)
  }

  private fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.requestTimeout)
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
  }

  async chat(
    request: ChatRequest,
    onEvent?: (event: StreamEvent) => void,
  ): Promise<ChatHandle> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new PostMemError(response.status, await response.text())
    }

    const body = await response.json()
    const conversationId = body.data?.conversationId ?? request.conversationId ?? ''
    if (!conversationId) {
      throw new Error('No conversationId returned from server')
    }

    const done = this.streamReader.consume(conversationId, (event) => {
      onEvent?.(event)
    }).then(({ fullContent, promptTokens, completionTokens }) => ({
      conversationId,
      fullContent,
      promptTokens,
      completionTokens,
    }))

    return { conversationId, done }
  }

  async cancel(conversationId: string): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    })
    if (!response.ok) {
      throw new PostMemError(response.status, await response.text())
    }
  }

  async getMessages(
    conversationId: string,
    params?: { page?: number; limit?: number },
  ): Promise<{ messages: ChatMessage[]; total: number; page: number; limit: number }> {
    const query = new URLSearchParams({ conversationId })
    if (params?.page) query.set('page', String(params.page))
    if (params?.limit) query.set('limit', String(params.limit))

    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/messages?${query}`)
    if (!res.ok) {
      throw new Error(`Get messages failed: ${res.status}`)
    }
    const json = await res.json()
    return json.data
  }

  async listConversations(
    params?: { page?: number; limit?: number },
  ): Promise<{ conversations: Conversation[]; total: number; page: number; limit: number }> {
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.limit) query.set('limit', String(params.limit))

    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations?${query}`)
    if (!res.ok) {
      throw new Error(`List conversations failed: ${res.status}`)
    }
    const json = await res.json()
    return json.data
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations/${conversationId}`)
    if (!res.ok) {
      throw new Error(`Get conversation failed: ${res.status}`)
    }
    const json = await res.json()
    return json.data
  }

  async createConversation(metadata?: Record<string, unknown>): Promise<Conversation> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata }),
    })
    if (!res.ok) {
      throw new Error(`Create conversation failed: ${res.status}`)
    }
    const json = await res.json()
    return json.data
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations?id=${conversationId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw new Error(`Delete conversation failed: ${res.status}`)
    }
  }

  async disconnect(): Promise<void> {
    await this.streamReader.disconnect()
  }
}
