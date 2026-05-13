import type { NextApiRequest, NextApiResponse } from 'next'
import { AppError, Errors } from '@/src/lib/errors'
import type { ApiResponse } from '@/src/types'

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
      // 记录完整的错误信息
      console.error('API Error:', {
        path: req.url,
        method: req.method,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })

      let appError: AppError

      if (error instanceof AppError) {
        appError = error
        // 如果 AppError 没有 details，添加堆栈信息
        if (!appError.details && error instanceof Error && error.stack) {
          appError = new AppError(
            error.code,
            error.message,
            error.stack
          )
        }
      } else {
        // 对于非 AppError，包含完整的错误信息和堆栈
        const errorDetails = error instanceof Error 
          ? `${error.message}\n\nStack trace:\n${error.stack}`
          : 'Unknown error'
        appError = Errors.internalError(errorDetails)
      }

      const response: ApiResponse = appError.toJSON()
      res.status(appError.statusCode).json(response)
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

  if (options.methods) {
    wrappedHandler = withMethod(options.methods, wrappedHandler)
  }

  return withErrorHandler(wrappedHandler)
}

/**
 * 成功响应
 */
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
 * API 处理器
 */
export function apiHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  handlers: {
    GET?: () => Promise<void>
    POST?: () => Promise<void>
    PUT?: () => Promise<void>
    DELETE?: () => Promise<void>
    PATCH?: () => Promise<void>
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

  return handler()
}
