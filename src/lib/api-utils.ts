import type { NextApiRequest, NextApiResponse } from 'next'
import { AppError, Errors } from '@/src/lib/errors'
import type { ApiResponse } from '@/src/types'
import container from '@/src/lib/container'

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
 * 错误处理中间件
 */
export function withErrorHandler(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(req, res)
    } catch (error) {
      const errorDetails = formatErrorDetails(error, req)
      
      console.error('API Error occurred:')
      console.error(errorDetails)
      console.error('\n')

      let statusCode = 500
      let errorMessage = '内部错误'
      
      if (error instanceof AppError) {
        statusCode = error.statusCode
        errorMessage = error.message
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      res.status(statusCode).json({
        success: false,
        error: {
          code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
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
      res.status(405).json({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `方法 ${req.method} 不被允许`,
        },
      })
      return
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
    throw new Error('Request scope not initialized. Ensure withMiddleware is used.')
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
      throw new Error('Request scope not initialized')
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
 * 错误响应
 */
export function errorResponse(
  res: NextApiResponse,
  code: string,
  message: string,
  statusCode = 400,
  details?: string
) {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
  }
  res.status(statusCode).json(response)
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
    return res.status(405).json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: `方法 ${method} 不被允许`,
      },
    })
  }

  return handler(deps)
}
