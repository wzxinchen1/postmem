import type { NextApiRequest, NextApiResponse } from 'next'
import { createApiHandler } from '@/src/lib/api-utils'
import { logger } from '@/src/lib/logger'

interface Deps {}

interface RouteEntry {
  route: string
  status: number | 'skipped'
  error?: string
}

// 所有 API 路由的路径列表（开发时按需增减）
const API_ROUTES: string[] = [
  '/api/chat/stream',
  '/api/chat/message',
  '/api/chat/messages',
  '/api/chat/completions',
  '/api/chat/conversations',
  '/api/chat/cancel',
  '/api/kb/create',
  '/api/kb/delete',
  '/api/kb/ingest',
  '/api/kb/list',
  '/api/kb/search',
  '/api/kb/stats',
  '/api/models/default',
  '/api/providers/models',
  '/api/providers/validate',
  '/api/providers/tree',
  '/api/settings',
  '/api/sessions/stats',
  '/api/sessions',
  '/api/chat-settings',
  '/api/vendors',
  '/api/models',
  '/api/providers',
  '/api/init/providers',
]

export default createApiHandler<Deps>({
  dependencies: [],
  handler: async (req, res) => {
    if (req.method !== 'GET') {
      return res.status(405).end()
    }

    const port = process.env.PORT || '3000'
    const baseUrl = `http://localhost:${port}`
    const results: RouteEntry[] = []

    // 串行触发，避免大量并发压垮 dev server
    for (const route of API_ROUTES) {
      try {
        const response = await fetch(`${baseUrl}${route}`, {
          signal: AbortSignal.timeout(15_000),
        })
        results.push({ route, status: response.status })
      } catch (error) {
        logger.warn('[Warmup] 预热失败', { route, error: String(error) })
        results.push({ route, status: 'skipped', error: String(error) })
      }
    }

    const succeeded = results.filter((r) => r.status !== 'skipped').length
    logger.info('[Warmup] 预热完成', { total: API_ROUTES.length, succeeded })

    return res.status(200).json({
      total: API_ROUTES.length,
      succeeded,
      results,
    })
  },
})
