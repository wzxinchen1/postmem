/**
 * 应用错误类
 *
 * code 对应 api-errors.json 中的 key，由 withErrorHandler 统一查找状态码和消息模板。
 * params 用于模板插值（如 {max}、{actual}）。
 * innerError 用于异常链，withErrorHandler 会递归输出完整堆栈。
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly params?: Record<string, string | number>,
    innerError?: Error,
  ) {
    // message 暂存 code，withErrorHandler 会用模板渲染替换
    super(code, innerError ? { cause: innerError } : undefined)
    this.name = 'AppError'
  }
}

export function formatErrorChain(error: unknown): { type: string; message: string; stack: string | undefined }[] {
  if (!(error instanceof Error)) return []

  const chains: { type: string; message: string; stack: string | undefined }[] = []
  let current: Error | undefined = error
  while (current) {
    chains.push({
      type: current.constructor.name,
      message: current.message,
      stack: current.stack,
    })
    current = (current as any).cause instanceof Error ? (current as any).cause : undefined
  }
  return chains
}