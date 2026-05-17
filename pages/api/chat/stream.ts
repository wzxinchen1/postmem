import { redis } from '@/src/lib/redis'
import { logger } from '@/src/lib/logger'
import type { StreamEvent } from '@/src/services/sse.service'

const encoder = new TextEncoder()

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).send('方法不被允许')
  }

  const conversationId = req.query.conversationId
  if (!conversationId) {
    return res.status(400).send('conversationId 不能为空')
  }

  const redisKey = `chat:${conversationId}`
  let lastId = '0-0'

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const keepAliveInterval = setInterval(() => {
    res.write(`event: keep-alive\ndata: ${Date.now()}\n\n`)
  }, 30000)

  req.on('close', () => {
    clearInterval(keepAliveInterval)
    res.end()
  })

  try {
    while (true) {
      const result = await redis.xread(
        'STREAMS',
        redisKey,
        lastId
      )

      if (result && result.length > 0) {
        const [, messages] = result[0]
        for (const [msgId, fields] of messages) {
          lastId = msgId
          const parsed: Record<string, string> = {}
          for (let i = 0; i < fields.length; i += 2) {
            parsed[fields[i]] = fields[i + 1]
          }
          const { event, data } = parsed

          if (data === '[DONE]') {
            await redis.del(redisKey)
            clearInterval(keepAliveInterval)
            res.end()
            return
          }

          let streamEvent: StreamEvent
          try {
            streamEvent = JSON.parse(data)
          } catch {
            res.write(`event: ${event}\ndata: ${data || ''}\n\n`)
            continue
          }

          const sseData = formatSSEEvent(streamEvent)
          res.write(`event: message\ndata: ${JSON.stringify(sseData)}\n\n`)

          if (streamEvent.type === 'done') {
            clearInterval(keepAliveInterval)
            res.end()
            return
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }
  } catch (err) {
    logger.error('[stream] SSE stream error', { errorMessage: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined })
    clearInterval(keepAliveInterval)
    res.end()
  }
}

function formatSSEEvent(event: StreamEvent) {
  switch (event.type) {
    case 'chunk':
      return {
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: event.model,
        choices: [{
          index: 0,
          delta: { role: 'assistant', content: event.content },
          finish_reason: null,
        }],
      }
    case 'status':
      return { type: 'status', status: event.status }
    case 'messageId':
      return { type: 'messageId', role: event.role, id: event.id }
    case 'usage':
      return {
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: event.promptTokens,
          completion_tokens: event.completionTokens,
          total_tokens: event.promptTokens + event.completionTokens,
        },
      }
    case 'error':
      return { type: 'error', message: event.message }
    case 'done':
      return { type: 'done' }
  }
}
