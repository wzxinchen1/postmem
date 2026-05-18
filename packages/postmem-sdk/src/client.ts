import { StreamReader } from './stream-reader'
import { PostMemError } from './types'
import type {
  PostMemConfig,
  ChatRequest,
  StreamEvent,
  ChatMessage,
  Conversation,
  ChatResult,
} from './types'

export class PostMemClient {
  private baseUrl: string
  private streamReader: StreamReader
  private requestTimeout: number

  constructor(config: PostMemConfig) {
    this.baseUrl = config.baseUrl
    this.requestTimeout = config.requestTimeout ?? 30_000
    this.streamReader = new StreamReader({
      baseUrl: config.baseUrl,
      requestTimeout: config.streamTimeout ?? 300_000,
    })
  }

  private fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.requestTimeout)
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
  }

  async chat(
    request: ChatRequest,
  ): Promise<string> {
    if (!request.messages || request.messages.length === 0) {
      throw PostMemError.validation('messages 不能为空')
    }
    if (!request.modelId) {
      throw PostMemError.validation('modelId 不能为空')
    }
    if (!request.kbId) {
      throw PostMemError.validation('kbId 不能为空')
    }

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
      throw PostMemError.serverError('No conversationId returned from server')
    }

    return conversationId
  }

  async consume(
    onEvent?: (event: StreamEvent) => void,
    options?: { signal?: AbortSignal },
  ): Promise<Response | ChatResult> {
    if (onEvent) {
      let fullContent = ''
      let promptTokens = 0
      let completionTokens = 0
      let conversationId = ''

      await this.streamReader.consume((event) => {
        onEvent(event)

        switch (event.type) {
          case 'chunk':
            fullContent += event.content
            break
          case 'usage':
            promptTokens = event.promptTokens
            completionTokens = event.completionTokens
            break
        }
      })

      return { conversationId, fullContent, promptTokens, completionTokens }
    }

    const encoder = new TextEncoder()
    const reader = this.streamReader

    const stream = new ReadableStream({
      async start(controller) {
        const signal = options?.signal

        if (signal) {
          if (signal.aborted) {
            controller.close()
            return
          }

          signal.addEventListener('abort', () => controller.close(), { once: true })
        }

        const keepAliveInterval = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(keepAliveInterval)
            return
          }
          controller.enqueue(encoder.encode(`: keep-alive\n\n`))
        }, 30_000)

        try {
          await reader.consume((event: StreamEvent) => {
            const data = JSON.stringify(event)
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          })
        } finally {
          clearInterval(keepAliveInterval)
        }

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
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
      throw new PostMemError(res.status, await res.text())
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
      throw new PostMemError(res.status, `List conversations failed: ${res.status}`)
    }
    const json = await res.json()
    return json.data
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations/${conversationId}`)
    if (!res.ok) {
      throw new PostMemError(res.status, `Get conversation failed: ${res.status}`)
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
      throw new PostMemError(res.status, `Create conversation failed: ${res.status}`)
    }
    const json = await res.json()
    return json.data
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations?id=${conversationId}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      throw new PostMemError(res.status, `Delete conversation failed: ${res.status}`)
    }
  }
}
