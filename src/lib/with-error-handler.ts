import { NextRequest } from 'next/server'
import { AppError } from '@/src/lib/errors'
import { logger } from '@/src/lib/logger'
import apiErrorsConfig from '@/src/config/api-errors.json'

type ApiErrorCode = keyof typeof apiErrorsConfig

function formatErrorDetails(error: unknown, request: NextRequest): string {
  const lines: string[] = []

  const formatException = (err: Error, indent: string = ''): void => {
    lines.push(`${indent}Exception Type: ${err.constructor.name}`)
    lines.push(`${indent}Message: ${err.message}`)

    if (err.stack) {
      const stackLines = err.stack.split('\n')
      lines.push(`${indent}StackTrace:`)
      stackLines.forEach(line => {
        lines.push(`${indent}  ${line}`)
      })
    }

    if (err.cause instanceof Error) {
      lines.push(`${indent}---> Inner Exception`)
      formatException(err.cause, indent + '   ')
      lines.push(`${indent}--- End of inner exception stack trace ---`)
    }
  }

  lines.push('=== Request Information ===')
  lines.push(`Request Path: ${request.nextUrl.pathname}`)
  lines.push(`Request Method: ${request.method}`)
  lines.push(`Timestamp: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('=== Exception Details ===')

  if (error instanceof Error) {
    formatException(error)
  } else {
    lines.push(`Unknown error: ${String(error)}`)
  }

  return lines.join('\n')
}

function renderErrorMessage(code: string, params?: Record<string, string | number>): string {
  const config = apiErrorsConfig[code as ApiErrorCode]
  if (!config) {
    return `未知错误码: ${code}`
  }
  let message = config.message
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
    }
  }
  return message
}

export function withErrorHandler<TParams extends Record<string, string> = Record<string, string>>(
  handler: (request: NextRequest, { params }: { params: TParams }) => Promise<Response>
) {
  return async (request: NextRequest, { params }: { params: TParams }): Promise<Response> => {
    try {
      return await handler(request, { params })
    } catch (error) {
      const errorDetails = formatErrorDetails(error, request)
      logger.error('API Error occurred', { errorDetails })

      let statusCode = 500
      let errorMessage = '内部错误'

      if (error instanceof AppError) {
        const config = apiErrorsConfig[error.code as ApiErrorCode]
        if (config) {
          statusCode = config.statusCode
          errorMessage = renderErrorMessage(error.code, error.params)
        } else {
          logger.error('[with-error-handler] 未知的错误码', { code: error.code })
        }
      } else if (error instanceof Error) {
        // 500 错误返回 Exception.ToString() 格式的完整错误详情
        errorMessage = formatErrorDetails(error, request)
      }

      return new Response(errorMessage, { status: statusCode })
    }
  }
}
