import type { StreamEvent } from './types'
import { PostMemError } from './types'

interface StreamReaderConfig {
  baseUrl: string
  requestTimeout?: number
}

export class StreamReader {
  private baseUrl: string
  private requestTimeout: number

  constructor(config: StreamReaderConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.requestTimeout = config.requestTimeout ?? 0
  }

  async consume(
    onEvent: (event: StreamEvent) => void,
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    if (typeof onEvent !== 'function') {
      throw PostMemError.validation('onEvent callback is required')
    }

    const externalSignal = options?.signal
    if (externalSignal?.aborted) return

    let retryDelay = 1000

    while (true) {
      if (externalSignal?.aborted) return

      const controller = new AbortController()

      if (this.requestTimeout > 0) {
        setTimeout(() => controller.abort(), this.requestTimeout)
      }

      if (externalSignal) {
        if (externalSignal.aborted) return
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }

      try {
        const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new PostMemError(response.status, `Stream request failed: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw PostMemError.serverError('Failed to get response reader')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        retryDelay = 1000

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
          }
        }
      } catch {
        if (externalSignal?.aborted) return
      }

      await new Promise(resolve => setTimeout(resolve, retryDelay))
      retryDelay = Math.min(retryDelay * 2, 30_000)
    }
  }
}
