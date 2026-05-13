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
      console.error('API Error:', error)

      let appError: AppError

      if (error instanceof AppError) {
        appError = error
      } else {
        appError = Errors.internalError(
          error instanceof Error ? error.message : 'Unknown error'
        )
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
export function successResponse<T>(res: NextApiResponse, data: T) {
  const response: ApiResponse<T> = {
    success: true,
    data,
  }
  res.status(200).json(response)
}
