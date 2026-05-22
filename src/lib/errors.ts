/**
 * 错误码定义
 */
export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * HTTP 状态码映射
 */
export const ErrorCodeToStatus: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.INTERNAL_ERROR]: 500,
}

/**
 * 应用错误类（支持 innerError 异常链）
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    innerError?: Error
  ) {
    super(message, innerError ? { cause: innerError } : undefined)
    this.name = 'AppError'
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.cause instanceof Error && { causeMessage: this.cause.message }),
      },
    }
  }

  get statusCode() {
    return ErrorCodeToStatus[this.code]
  }
}

/**
 * 错误工厂函数
 * message 为必填参数，编译期强制约束
 */
export const Errors = {
  badRequest: (message: string, innerError?: Error) =>
    new AppError(ErrorCode.BAD_REQUEST, message, innerError),

  internalError: (message: string, innerError?: Error) =>
    new AppError(ErrorCode.INTERNAL_ERROR, message, innerError),
}
