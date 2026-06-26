import { NextRequest } from 'next/server'
import { ProviderService } from '@/src/services/provider.service'
import { createApiHandler, successResponse } from '@/src/lib/api-utils'

interface Deps {
  providerService: ProviderService
}

export const GET = createApiHandler<Deps>({
  dependencies: ['providerService'],
  handler: async (deps, request) => {
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'
    const tree = await deps.providerService.getTree(includeInactive)
    return successResponse({ tree })
  },
})
