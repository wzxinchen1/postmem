export type StreamEvent =
  | { type: 'chunk'; content: string; model: { id: string; name: string } }
  | { type: 'status'; status: StreamStatus }
  | { type: 'messageId'; role: 'user' | 'assistant'; id: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done' }

export type StreamStatus =
  | 'searchingWeb'
  | 'searchingMemory'
  | 'summarizing'
  | 'memoryProgress'

interface StreamReaderConfig {
  baseUrl: string
  requestTimeout?: number
}

export class StreamReader {
  private baseUrl: string
  private requestTimeout: number

  constructor(config: StreamReaderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.requestTimeout = config.requestTimeout ?? 300_000
  }

  async consume(
    onEvent: (event: StreamEvent) => void,
  ): Promise<void> {
    if (typeof onEvent !== 'function') {
      throw new Error('onEvent callback is required')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout)

    try {
      const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Stream request failed: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      const decoder = new TextDecoder()
      let buffer = ''

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
          if (!jsonStr || jsonStr === '[DONE]') continue

          let event: StreamEvent
          try {
            event = JSON.parse(jsonStr)
          } catch {
            continue
          }

          onEvent(event)

          if (event.type === 'done' || event.type === 'error') {
            return
          }
        }
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
