/**
 * 错误码定义
 */
export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  KB_NOT_FOUND = 'KB_NOT_FOUND',
  MEMORY_NOT_FOUND = 'MEMORY_NOT_FOUND',
  EMBEDDING_ERROR = 'EMBEDDING_ERROR',
  CUT_MODEL_ERROR = 'CUT_MODEL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * HTTP 状态码映射
 */
export const ErrorCodeToStatus: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.KB_NOT_FOUND]: 404,
  [ErrorCode.MEMORY_NOT_FOUND]: 404,
  [ErrorCode.EMBEDDING_ERROR]: 500,
  [ErrorCode.CUT_MODEL_ERROR]: 500,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.INTERNAL_ERROR]: 500,
}

/**
 * 应用错误类
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: string
  ) {
    super(message)
    this.name = 'AppError'
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    }
  }

  get statusCode() {
    return ErrorCodeToStatus[this.code]
  }
}

/**
 * 错误工厂函数
 */
export const Errors = {
  badRequest: (message: string, details?: string) =>
    new AppError(ErrorCode.BAD_REQUEST, message, details),

  projectNotFound: (kbName: string) =>
    new AppError(ErrorCode.KB_NOT_FOUND, `知识库 '${kbName}' 不存在`),

  memoryNotFound: (id: string) =>
    new AppError(ErrorCode.MEMORY_NOT_FOUND, `片段 ID ${id} 不存在`),

  embeddingError: (details: string) =>
    new AppError(ErrorCode.INTERNAL_ERROR, 'AI 嵌入服务异常', details),

  cutModelError: (details: string) =>
    new AppError(ErrorCode.INTERNAL_ERROR, 'AI 模型推理服务异常', details),

  databaseError: (details: string) =>
    new AppError(ErrorCode.DATABASE_ERROR, '数据库操作异常', details),

  internalError: (details?: string) =>
    new AppError(ErrorCode.INTERNAL_ERROR, '内部错误', details),
}
