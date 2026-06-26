import { NextRequest } from 'next/server'
import { AppError } from '@/src/lib/errors'
import container from '@/src/lib/container'
import apiErrorsConfig from '@/src/config/api-errors.json'
import { withErrorHandler } from '@/src/lib/with-error-handler'

export type ApiErrorCode = keyof typeof apiErrorsConfig

export function successResponse<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status })
}

export function errorResponse(
  code: ApiErrorCode,
  params?: Record<string, string | number>,
): never {
  throw new AppError(code, params)
}

export function createApiHandler<TDeps extends Record<string, any>, TParams extends Record<string, string> = Record<string, string>>(options: {
  dependencies: (keyof TDeps)[]
  handler: (deps: TDeps, request: NextRequest, { params }: { params: TParams }) => Promise<Response>
}) {
  return withErrorHandler<TParams>(async (request, { params }) => {
    const scope = container.createScope()
    const deps = {} as TDeps
    for (const key of options.dependencies) {
      deps[key] = scope.resolve(key as string) as TDeps[typeof key]
    }
    return await options.handler(deps, request, { params })
  })
}
