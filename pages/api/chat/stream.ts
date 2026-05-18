import { redis } from '@/src/lib/redis'
import { logger } from '@/src/lib/logger'

const encoder = new TextEncoder()
const GLOBAL_STREAM_KEY = 'chat:global'
const POLL_INTERVAL_MS = 200
const KEEP_ALIVE_MS = 30000

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).send('方法不被允许')
  }

  let lastId = '0-0'

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const keepAliveInterval = setInterval(() => {
    res.write(`event: keep-alive\ndata: ${Date.now()}\n\n`)
  }, KEEP_ALIVE_MS)

  req.on('close', () => {
    clearInterval(keepAliveInterval)
    res.end()
  })

  try {
    while (true) {
      const result = await redis.xread(
        'STREAMS',
        GLOBAL_STREAM_KEY,
        lastId,
      )

      if (result && result.length > 0) {
        const [, messages] = result[0]
        for (const [msgId, fields] of messages) {
          lastId = msgId
          const parsed: Record<string, string> = {}
          for (let i = 0; i < fields.length; i += 2) {
            parsed[fields[i]] = fields[i + 1]
          }
          const data = parsed.data

          res.write(`data: ${data}\n\n`)

          let streamEvent: any
          try {
            streamEvent = JSON.parse(data)
          } catch {
            continue
          }

          if (streamEvent.type === 'done' || streamEvent.type === 'error') {
            clearInterval(keepAliveInterval)
            res.end()
            return
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  } catch (err) {
    logger.error('[stream] SSE stream error', err)
    clearInterval(keepAliveInterval)
    res.end()
  }
}
