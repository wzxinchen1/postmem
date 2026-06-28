import { StreamReader } from './stream-reader'
import { PostMemError } from './types'
import type {
  PostMemConfig,
  ChatRequest,
  StreamEvent,
  ChatMessage,
  Conversation,
  ChatResult,
  ChatMessageListResult,
  KnowledgeBaseInfo,
  KnowledgeBaseStats,
  SearchSourceInfo,
  IngestMessage,
  IngestTextResponse,
  IngestMessagesResponse,
  IngestStreamEvent,
  Vendor,
  CreateVendorRequest,
  UpdateVendorRequest,
  Provider,
  CreateProviderRequest,
  UpdateProviderRequest,
  Model,
  CreateModelRequest,
  UpdateModelRequest,
  ModelCapability,
  ProviderTreeNode,
  Session,
  SessionStats,
  AppSettings,
  ChatSettingInfo,
  ValidateModelsResult,
  WarmupResult,
} from './types'

async function executeRequest(url: string, timeout: number, options?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw PostMemError.timeout()
    }
    throw PostMemError.network(error instanceof Error ? error.message : String(error))
  } finally {
    clearTimeout(timer)
  }
}

class HttpClient {
  private baseUrl: string
  private timeout: number

  constructor(baseUrl: string, timeout: number) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.timeout = timeout
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await executeRequest(`${this.baseUrl}${path}`, this.timeout, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new PostMemError(response.status, text)
    }

    const json: { success: boolean; data: T } = await response.json()
    return json.data
  }

  private async requestVoid(method: string, path: string, body?: unknown): Promise<void> {
    const response = await executeRequest(`${this.baseUrl}${path}`, this.timeout, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new PostMemError(response.status, text)
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body)
  }

  deleteVoid(path: string, body?: unknown): Promise<void> {
    return this.requestVoid('DELETE', path, body)
  }
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

export class PostMemClient {
  private http: HttpClient
  private streamReader: StreamReader
  private requestTimeout: number

  constructor(config: PostMemConfig) {
    this.http = new HttpClient(config.baseUrl, config.requestTimeout ?? 30_000)
    this.requestTimeout = config.requestTimeout ?? 30_000
    this.streamReader = new StreamReader({
      baseUrl: config.baseUrl,
      requestTimeout: config.streamTimeout ?? 300_000,
    })
  }

  async chat(request: ChatRequest): Promise<string> {
    if (!request.messages || request.messages.length === 0) {
      throw PostMemError.validation('messages 不能为空')
    }
    if (!request.modelId) {
      throw PostMemError.validation('modelId 不能为空')
    }
    if (!request.kbId) {
      throw PostMemError.validation('kbId 不能为空')
    }

    const response = await executeRequest(`${this.streamReader.baseUrl}/api/chat/completions`, this.requestTimeout, {
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
      let error: string | undefined
      let userTokens: number | undefined
      let userTotalTokens: number | undefined
      let totalTokens: number | undefined
      let completionTokens: number | undefined
      let reasoningTokens: number | undefined
      let conversationId = ''

      await this.streamReader.consume((event) => {
        onEvent(event)

        switch (event.type) {
          case 'chunk':
            fullContent += event.content
            break
          case 'done':
            error = event.error ?? undefined
            userTokens = event.userTokens
            userTotalTokens = event.userTotalTokens
            totalTokens = event.totalTokens
            completionTokens = event.completionTokens
            reasoningTokens = event.reasoningTokens
            this.cleanup().catch(() => {})
            break
          case 'error':
            this.cleanup().catch(() => {})
            break
        }
      }, { signal: options?.signal })

      return { conversationId, fullContent, error, userTokens, userTotalTokens, totalTokens, completionTokens, reasoningTokens }
    }

    const encoder = new TextEncoder()
    const reader = this.streamReader
    const cleanup = () => this.cleanup().catch(() => {})

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
            if (event.type === 'done' || event.type === 'error') {
              cleanup()
            }
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
    await this.http.post<void>('/api/chat/cancel', { conversationId })
  }

  async cleanup(conversationId?: string): Promise<void> {
    await this.http.post<void>('/api/chat/cleanup', { conversationId })
  }

  async getMessage(messageId: string): Promise<ChatMessage> {
    return this.http.get<ChatMessage>(`/api/chat/message${buildQuery({ id: messageId })}`)
  }

  async getMessages(
    conversationId: string,
    params?: { page?: number; limit?: number; role?: string },
  ): Promise<ChatMessageListResult> {
    return this.http.get<ChatMessageListResult>(
      `/api/chat/messages${buildQuery({ conversationId, page: params?.page, limit: params?.limit, role: params?.role })}`
    )
  }

  async listConversations(
    params?: { page?: number; limit?: number },
  ): Promise<{ conversations: Conversation[]; total: number; page: number; limit: number }> {
    return this.http.get(`/api/chat/conversations${buildQuery({ page: params?.page, limit: params?.limit })}`)
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    return this.http.get<Conversation>(`/api/chat/conversations/${conversationId}`)
  }

  async createConversation(metadata?: Record<string, unknown>): Promise<Conversation> {
    return this.http.post<Conversation>('/api/chat/conversations', { metadata })
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.http.deleteVoid(`/api/chat/conversations${buildQuery({ id: conversationId })}`)
  }

  kb = {
    create: (name: string, description?: string): Promise<KnowledgeBaseInfo> => {
      return this.http.post<KnowledgeBaseInfo>('/api/kb/create', { name, description })
    },

    list: (kbId: string, page?: number, limit?: number, topicIds?: string[]): Promise<KnowledgeBaseInfo[]> => {
      const query: Record<string, string | number | boolean | undefined> = { kbId, page, limit }
      return this.http.get<KnowledgeBaseInfo[]>(`/api/kb/list${buildQuery(query)}`)
    },

    delete: (id: string): Promise<void> => {
      return this.http.post<void>('/api/kb/delete', { id })
    },

    stats: (kbId?: string): Promise<KnowledgeBaseStats> => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (kbId !== undefined && kbId !== null) {
        query.kbId = kbId
      }
      return this.http.get<KnowledgeBaseStats>(`/api/kb/stats${buildQuery(query)}`)
    },

    search: (
      kbId: string,
      query: string,
      topK?: number,
      contextWindow?: number,
    ): Promise<{ results: SearchSourceInfo[] }> => {
      const qs: Record<string, string | number | boolean | undefined> = {
        kbId,
        query,
        top_k: topK,
        context_window: contextWindow,
      }
      return this.http.get<{ results: SearchSourceInfo[] }>(`/api/kb/search${buildQuery(qs)}`)
    },

    ingestMessages: (kbId: string, messages: IngestMessage[]): Promise<IngestMessagesResponse> => {
      return this.http.post<IngestMessagesResponse>('/api/kb/ingest', { kbId, messages })
    },

    ingestText: async (
      kbId: string,
      content: string,
      onEvent?: (event: IngestStreamEvent) => void,
    ): Promise<IngestTextResponse> => {
      const response = await executeRequest(`${this.streamReader.baseUrl}/api/kb/ingest`, this.requestTimeout, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kbId, content }),
      })
      if (!response.ok) {
        throw new PostMemError(response.status, await response.text())
      }
      const reader = response.body?.getReader()
      if (!reader) {
        throw PostMemError.serverError('Failed to get response reader')
      }
      const decoder = new TextDecoder()
      let buffer = ''

      return new Promise((resolve, reject) => {
        ;(async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data:')) continue
                const jsonStr = trimmed.slice(5).trim()
                if (!jsonStr) continue

                try {
                  const event = JSON.parse(jsonStr) as IngestStreamEvent
                  if (onEvent) onEvent(event)
                  if (event.type === 'complete') {
                    resolve(event.data as unknown as IngestTextResponse)
                    return
                  }
                  if (event.type === 'error') {
                    reject(new PostMemError(500, JSON.stringify(event.data)))
                    return
                  }
                } catch {
                  // skip malformed events
                }
              }
            }
          } catch (error) {
            if (error instanceof PostMemError) {
              reject(error)
            } else {
              reject(PostMemError.network(error instanceof Error ? error.message : String(error)))
            }
          }
        })()
      })
    },
  }

  providers = {
    list: (includeInactive?: boolean): Promise<{ providers: Provider[] }> => {
      return this.http.get<{ providers: Provider[] }>(`/api/providers${buildQuery({ includeInactive })}`)
    },

    get: (id: string): Promise<{ provider: Provider }> => {
      return this.http.get<{ provider: Provider }>(`/api/providers/${id}`)
    },

    create: (data: CreateProviderRequest): Promise<{ provider: Provider }> => {
      return this.http.post<{ provider: Provider }>('/api/providers', data)
    },

    update: (id: string, data: UpdateProviderRequest): Promise<{ provider: Provider }> => {
      return this.http.put<{ provider: Provider }>(`/api/providers/${id}`, data)
    },

    delete: (id: string): Promise<{ deleted: boolean }> => {
      return this.http.delete<{ deleted: boolean }>(`/api/providers/${id}`)
    },

    getTree: (includeInactive?: boolean): Promise<{ tree: ProviderTreeNode[] }> => {
      return this.http.get<{ tree: ProviderTreeNode[] }>(`/api/providers/tree${buildQuery({ includeInactive })}`)
    },

    fetchModels: (vendorId: string, apiKey: string, baseUrl: string): Promise<ValidateModelsResult> => {
      return this.http.post<ValidateModelsResult>('/api/providers/models', { vendorId, apiKey, baseUrl })
    },

    validate: (vendorId: string, apiKey: string, baseUrl: string): Promise<{ valid: boolean; models: { id: string; name: string }[] }> => {
      return this.http.post<{ valid: boolean; models: { id: string; name: string }[] }>('/api/providers/validate', { vendorId, apiKey, baseUrl })
    },
  }

  models = {
    list: (includeInactive?: boolean, providerId?: string): Promise<{ models: Model[] }> => {
      return this.http.get<{ models: Model[] }>(`/api/models${buildQuery({ includeInactive, providerId })}`)
    },

    get: (id: string): Promise<{ model: Model }> => {
      return this.http.get<{ model: Model }>(`/api/models/${id}`)
    },

    create: (data: CreateModelRequest): Promise<{ model: Model }> => {
      return this.http.post<{ model: Model }>('/api/models', data)
    },

    update: (id: string, data: UpdateModelRequest): Promise<{ model: Model }> => {
      return this.http.put<{ model: Model }>(`/api/models/${id}`, data)
    },

    delete: (id: string): Promise<{ deleted: boolean }> => {
      return this.http.delete<{ deleted: boolean }>(`/api/models/${id}`)
    },

    getDefault: (capability: ModelCapability): Promise<{ model: Model }> => {
      return this.http.get<{ model: Model }>(`/api/models/default${buildQuery({ capability })}`)
    },
  }

  vendors = {
    list: (includeInactive?: boolean): Promise<{ vendors: Vendor[] }> => {
      return this.http.get<{ vendors: Vendor[] }>(`/api/vendors${buildQuery({ includeInactive })}`)
    },

    get: (id: string): Promise<{ vendor: Vendor }> => {
      return this.http.get<{ vendor: Vendor }>(`/api/vendors/${id}`)
    },

    create: (data: CreateVendorRequest): Promise<{ vendor: Vendor }> => {
      return this.http.post<{ vendor: Vendor }>('/api/vendors', data)
    },

    update: (id: string, data: UpdateVendorRequest): Promise<{ vendor: Vendor }> => {
      return this.http.put<{ vendor: Vendor }>(`/api/vendors/${id}`, data)
    },

    delete: (id: string): Promise<{ deleted: boolean }> => {
      return this.http.delete<{ deleted: boolean }>(`/api/vendors/${id}`)
    },
  }

  sessions = {
    list: (params?: { kbId?: string; modelType?: string; status?: string; page?: number; limit?: number }): Promise<{ sessions: Session[]; total: number; page: number; limit: number }> => {
      return this.http.get(`/api/sessions${buildQuery({
        kbId: params?.kbId,
        modelType: params?.modelType,
        status: params?.status,
        page: params?.page,
        limit: params?.limit,
      })}`)
    },

    get: (id: string): Promise<{ session: Session }> => {
      return this.http.get<{ session: Session }>(`/api/sessions/${id}`)
    },

    delete: (id: string): Promise<void> => {
      return this.http.delete<void>(`/api/sessions/${id}`)
    },

    stats: (): Promise<SessionStats> => {
      return this.http.get<SessionStats>('/api/sessions/stats')
    },
  }

  settings = {
    get: (): Promise<{ settings: AppSettings }> => {
      return this.http.get<{ settings: AppSettings }>('/api/settings')
    },

    update: (data: Partial<AppSettings>): Promise<{ settings: AppSettings }> => {
      return this.http.put<{ settings: AppSettings }>('/api/settings', data)
    },
  }

  chatSettings = {
    get: (): Promise<{ setting: ChatSettingInfo }> => {
      return this.http.get<{ setting: ChatSettingInfo }>('/api/chat-settings')
    },

    update: (data: Partial<ChatSettingInfo>): Promise<{ setting: ChatSettingInfo }> => {
      return this.http.put<{ setting: ChatSettingInfo }>('/api/chat-settings', data)
    },
  }

  init = {
    providers: (): Promise<void> => {
      return this.http.get<void>('/api/init/providers')
    },
  }

  async warmup(): Promise<WarmupResult> {
    return this.http.get<WarmupResult>('/api/__warmup')
  }
}
