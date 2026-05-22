import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { logger } from '@/src/lib/logger'
import { Errors } from '@/src/lib/errors'

export interface LLMInvokeOptions {
  agent: ChatOpenAI
  messages: (SystemMessage | HumanMessage | AIMessage)[]
  maxRetries?: number
  timeoutMs?: number
}

export interface LLMStreamOptions {
  agent: ChatOpenAI
  messages: (SystemMessage | HumanMessage | AIMessage)[]
  maxRetries?: number
  timeoutMs?: number
  onChunk?: (chunk: string) => Promise<void>
  onTokenMetadata?: (metadata: TokenMetadata) => void
}

export interface TokenMetadata {
  promptTokens: number
  completionTokens: number
}

export interface LLMInvokeResult {
  content: string
  usage?: TokenMetadata
}

export interface LLMStreamResult {
  fullContent: string
  usage: TokenMetadata
}

export interface ValidateResult<T> {
  data: T
  repaired?: boolean
}

export class LLMResilienceService {
  private static readonly DEFAULT_MAX_RETRIES = 3
  private static readonly DEFAULT_TIMEOUT_MS = 120_000
  private static readonly BACKOFF_BASE_MS = 1000

  async invokeWithRetry(options: LLMInvokeOptions): Promise<LLMInvokeResult> {
    if (options.maxRetries === undefined || options.maxRetries === null) {
      throw Errors.internalError('invokeWithRetry 缺少 maxRetries 参数')
    }
    if (options.timeoutMs === undefined || options.timeoutMs === null) {
      throw Errors.internalError('invokeWithRetry 缺少 timeoutMs 参数')
    }
    const maxRetries = options.maxRetries
    const timeoutMs = options.timeoutMs
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

        const response = await options.agent.invoke(options.messages, {
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        const content = response.content.toString()
        if (!content || content.trim().length === 0) {
          throw Errors.internalError('LLM 返回空内容')
        }

        const usage = this.extractUsage(response)

        logger.info('[LLMResilience] invoke 成功', { attempt, contentLength: content.length })

        return { content, usage }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        logger.error('[LLMResilience] invoke 失败', {
          attempt,
          maxRetries,
          errorMessage: lastError.message,
          errorStack: lastError.stack,
          errorCause: (lastError as any).cause?.message,
        })

        if (attempt < maxRetries) {
          await this.backoff(attempt)
        }
      }
    }

    throw Errors.internalError(
      `LLM invoke 失败，已重试 ${maxRetries} 次: ${lastError?.message}`
    )
  }

  async invokeWithValidation<T>(
    options: LLMInvokeOptions,
    validator: (parsed: unknown) => T
  ): Promise<ValidateResult<T>> {
    if (options.maxRetries === undefined || options.maxRetries === null) {
      throw Errors.internalError('invokeWithValidation 缺少 maxRetries 参数')
    }
    const maxRetries = options.maxRetries
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.invokeWithRetry({
        ...options,
        maxRetries: 1,
      })

      try {
        const parsed = this.parseJSON(result.content)
        const validated = validator(parsed)
        return { data: validated }
      } catch (validationError) {
        lastError = validationError instanceof Error ? validationError : new Error(String(validationError))

        logger.error('[LLMResilience] JSON 解析/校验失败', {
          attempt,
          maxRetries,
          errorMessage: lastError.message,
          rawContent: result.content.slice(0, 500),
        })

        if (attempt < maxRetries) {
          await this.backoff(attempt)
        }
      }
    }

    throw Errors.internalError(
      `LLM 响应校验失败，已重试 ${maxRetries} 次: ${lastError?.message}`
    )
  }

  async streamWithRetry(options: LLMStreamOptions): Promise<LLMStreamResult> {
    if (options.maxRetries === undefined || options.maxRetries === null) {
      throw Errors.internalError('streamWithRetry 缺少 maxRetries 参数')
    }
    if (options.timeoutMs === undefined || options.timeoutMs === null) {
      throw Errors.internalError('streamWithRetry 缺少 timeoutMs 参数')
    }
    const maxRetries = options.maxRetries
    const timeoutMs = options.timeoutMs
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let fullContent = ''
      let promptTokens = 0
      let completionTokens = 0
      let streamCompleted = false

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

        const stream = await options.agent.stream(options.messages, {
          signal: controller.signal,
        })

        for await (const chunk of stream) {
          if (chunk.usage_metadata) {
            const meta = chunk.usage_metadata
            if (typeof meta.input_tokens !== 'number') {
              throw Errors.internalError('LLM 响应 usage_metadata 缺少 input_tokens')
            }
            if (typeof meta.output_tokens !== 'number') {
              throw Errors.internalError('LLM 响应 usage_metadata 缺少 output_tokens')
            }
            promptTokens = meta.input_tokens
            completionTokens = meta.output_tokens
          } else if (chunk.response_metadata) {
            const meta = chunk.response_metadata
            if (typeof meta.prompt_eval_count !== 'number') {
              throw Errors.internalError('LLM 响应 response_metadata 缺少 prompt_eval_count')
            }
            if (typeof meta.eval_count !== 'number') {
              throw Errors.internalError('LLM 响应 response_metadata 缺少 eval_count')
            }
            promptTokens = meta.prompt_eval_count
            completionTokens = meta.eval_count
          }

          const content = typeof chunk.content === 'string' ? chunk.content : ''
          fullContent += content

          if (options.onChunk) {
            await options.onChunk(content)
          }
        }

        clearTimeout(timeoutId)
        streamCompleted = true

        if (!fullContent || fullContent.trim().length === 0) {
          throw Errors.internalError('LLM 流式响应返回空内容')
        }

        const usage: TokenMetadata = { promptTokens, completionTokens }

        if (options.onTokenMetadata) {
          options.onTokenMetadata(usage)
        }

        logger.info('[LLMResilience] stream 成功', {
          attempt,
          contentLength: fullContent.length,
          promptTokens,
          completionTokens,
        })

        return { fullContent, usage }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (!streamCompleted && fullContent.length > 0) {
          logger.error('[LLMResilience] 流式中断，已有部分内容', {
            attempt,
            maxRetries,
            receivedContentLength: fullContent.length,
            errorMessage: lastError.message,
          })
        } else {
          logger.error('[LLMResilience] stream 失败', {
            attempt,
            maxRetries,
            errorMessage: lastError.message,
          })
        }

        if (attempt < maxRetries) {
          await this.backoff(attempt)
        }
      }
    }

    throw Errors.internalError(
      `LLM stream 失败，已重试 ${maxRetries} 次: ${lastError?.message}`
    )
  }

  /**
   * 安全 JSON 解析：封装 try-catch，解析失败返回 null
   */
  private safeJsonParse(input: string): unknown {
    try {
      return JSON.parse(input)
    } catch {
      return null
    }
  }

  parseJSON<T>(rawContent: string): T {
    let jsonStr = rawContent.trim()

    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (jsonObjectMatch) {
      jsonStr = jsonObjectMatch[0]
    }

    const jsonArrayMatch = jsonStr.match(/\[[\s\S]*\]/)
    if (!jsonObjectMatch && jsonArrayMatch) {
      jsonStr = jsonArrayMatch[0]
    }

    jsonStr = jsonStr
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')

    const firstResult = this.safeJsonParse(jsonStr)
    if (firstResult !== null) {
      return firstResult as T
    }

    const repaired = this.tryRepairJSON(jsonStr)
    if (repaired !== null) {
      logger.info('[LLMResilience] JSON 修复成功')
      return repaired as T
    }

    throw Errors.internalError(
      `JSON 解析失败: ${jsonStr.slice(0, 200)}`
    )
  }

  private tryRepairJSON(jsonStr: string): unknown | null {
    const repairs: ((s: string) => string)[] = [
      (s) => s.replace(/'/g, '"'),
      (s) => s.replace(/(\w+)\s*:/g, '"$1":'),
      (s) => s + '}',
      (s) => s + ']',
      (s) => s + '"}',
    ]

    for (const repair of repairs) {
      const result = this.safeJsonParse(repair(jsonStr))
      if (result !== null) return result
    }

    return null
  }

  private extractUsage(response: any): TokenMetadata | undefined {
    if (response.usage_metadata) {
      const meta = response.usage_metadata
      const inputTokens = meta.input_tokens ?? meta.prompt_tokens
      const outputTokens = meta.output_tokens ?? meta.completion_tokens
      if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
        logger.warn('[LLMResilience] usage_metadata 字段不完整', { keys: Object.keys(meta), meta })
        return undefined
      }
      return { promptTokens: inputTokens, completionTokens: outputTokens }
    }

    if (response.response_metadata) {
      const meta = response.response_metadata
      const promptTokens = meta.prompt_eval_count
      const evalCount = meta.eval_count
      if (typeof promptTokens !== 'number' || typeof evalCount !== 'number') {
        logger.warn('[LLMResilience] response_metadata 字段不完整', { keys: Object.keys(meta) })
        return undefined
      }
      return { promptTokens, completionTokens: evalCount }
    }

    return undefined
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = LLMResilienceService.BACKOFF_BASE_MS * Math.pow(2, attempt - 1)
    const jitter = Math.random() * delay * 0.1
    const totalDelay = delay + jitter

    logger.info('[LLMResilience] 退避等待', { attempt, delayMs: totalDelay })
    await new Promise((resolve) => setTimeout(resolve, totalDelay))
  }
}
