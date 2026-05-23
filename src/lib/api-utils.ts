import type { NextApiRequest, NextApiResponse } from 'next'
import { AppError } from '@/src/lib/errors'
import { logger } from '@/src/lib/logger'
import type { ApiResponse } from '@/src/types'
import container from '@/src/lib/container'
import apiErrorsConfig from '@/src/config/api-errors.json'

/**
 * API 错误码类型（从配置文件自动推导）
 */
export type ApiErrorCode = keyof typeof apiErrorsConfig

/**
 * 扩展 NextApiRequest 以包含 scope
 */
declare module 'next' {
  interface NextApiRequest {
    scope?: ReturnType<typeof container.createScope>
  }
}

/**
 * 格式化错误信息为 .NET 风格的异常详情
 */
function formatErrorDetails(error: unknown, req: NextApiRequest): string {
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
  lines.push(`Request Path: ${req.url}`)
  lines.push(`Request Method: ${req.method}`)
  lines.push(`Timestamp: ${new Date().toISOString()}`)
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    lines.push(`Request Body: ${JSON.stringify(req.body, null, 2)}`)
  }
  lines.push('')
  lines.push('=== Exception Details ===')
  
  if (error instanceof Error) {
    formatException(error)
  } else {
    lines.push(`Unknown error: ${String(error)}`)
  }
  
  return lines.join('\n')
}

/**
 * 根据 api-errors.json 渲染错误消息（模板插值）
 */
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

/**
 * 错误处理中间件
 *
 * 统一捕获所有异常：
 * - AppError：从 api-errors.json 查找状态码和消息模板，渲染后响应
 * - 原生 Error：500 + 原始消息
 * - 所有异常都会通过 formatErrorDetails 输出完整堆栈到日志
 */
export function withErrorHandler(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(req, res)
    } catch (error) {
      const errorDetails = formatErrorDetails(error, req)
      logger.error('API Error occurred', { errorDetails })

      let statusCode = 500
      let errorMessage = '内部错误'
      
      if (error instanceof AppError) {
        const config = apiErrorsConfig[error.code as ApiErrorCode]
        if (config) {
          statusCode = config.statusCode
          errorMessage = renderErrorMessage(error.code, error.params)
        } else {
          logger.error('[api-utils] 未知的错误码', { code: error.code })
        }
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      res.status(statusCode).send(errorMessage)
    }
  }
}

/**
 * 方法验证中间件
 */
export function withMethod(
  allowedMethods: string[],
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    if (!allowedMethods.includes(req.method || '')) {
      res.setHeader('Allow', allowedMethods.join(', '))
      throw new AppError('METHOD_NOT_ALLOWED')
    }

    await handler(req, res)
  }
}

/**
 * 组合中间件
 */
export function withMiddleware(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  options: {
    methods?: string[]
  } = {}
) {
  let wrappedHandler = handler

  wrappedHandler = async (req: NextApiRequest, res: NextApiResponse) => {
    req.scope = container.createScope()
    await handler(req, res)
  }

  if (options.methods) {
    wrappedHandler = withMethod(options.methods, wrappedHandler)
  }

  return withErrorHandler(wrappedHandler)
}

/**
 * 从请求 scope 解析服务
 */
export function resolveFromScope<T>(req: NextApiRequest, name: string): T {
  if (!req.scope) {
    throw new AppError('INTERNAL_ERROR')
  }
  return req.scope.resolve<T>(name)
}

/**
 * 创建带依赖注入的 API 处理器
 * 
 * @example
 * ```typescript
 * interface KBDeps {
 *   kbService: KBService
 *   settingService: SettingService
 * }
 * 
 * export default createApiHandler<KBDeps>({
 *   methods: ['POST'],
 *   dependencies: ['kbService', 'settingService'],
 *   handler: async (req, res, deps) => {
 *     const result = await deps.kbService.createKnowledgeBase(...)
 *     successResponse(res, result)
 *   }
 * })
 * ```
 */
export function createApiHandler<TDeps extends Record<string, any>>(options: {
  methods?: string[]
  dependencies: (keyof TDeps)[]
  handler: (req: NextApiRequest, res: NextApiResponse, deps: TDeps) => Promise<void>
}) {
  return withMiddleware(async (req, res) => {
    if (!req.scope) {
      throw new AppError('INTERNAL_ERROR')
    }

    const deps = {} as TDeps
    for (const key of options.dependencies) {
      deps[key] = req.scope.resolve(key as string)
    }

    await options.handler(req, res, deps)
  }, { methods: options.methods })
}

export function successResponse<T>(res: NextApiResponse, data: T, statusCode = 200) {
  const response: ApiResponse<T> = {
    success: true,
    data,
  }
  res.status(statusCode).json(response)
}

/**
 * 抛出业务错误
 *
 * 不直接响应 HTTP，由 withErrorHandler 统一捕获后：
 * 1. 从 api-errors.json 查找状态码和消息模板
 * 2. 渲染模板插值
 * 3. 输出完整调用堆栈到日志
 * 4. 响应客户端
 *
 * @param code 错误码 key（对应 api-errors.json 中的 key）
 * @param params 模板插值参数，用于替换 message 中的 {key} 占位符
 */
export function errorResponse(
  code: ApiErrorCode,
  params?: Record<string, string | number>,
): never {
  throw new AppError(code, params)
}

/**
 * API 处理器（支持依赖注入）
 */
export function apiHandler<TDeps extends Record<string, any>>(
  req: NextApiRequest,
  res: NextApiResponse,
  deps: TDeps,
  handlers: {
    GET?: (deps: TDeps) => Promise<void>
    POST?: (deps: TDeps) => Promise<void>
    PUT?: (deps: TDeps) => Promise<void>
    DELETE?: (deps: TDeps) => Promise<void>
    PATCH?: (deps: TDeps) => Promise<void>
  }
) {
  const method = req.method as keyof typeof handlers
  const handler = handlers[method]

  if (!handler) {
    const allowedMethods = Object.keys(handlers).join(', ')
    res.setHeader('Allow', allowedMethods)
    throw new AppError('METHOD_NOT_ALLOWED')
  }

  return handler(deps)
}
