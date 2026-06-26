import { Readable } from 'node:stream'
import { NextRequest } from 'next/server'
import { redis } from '@/src/lib/redis'
import { logger } from '@/src/lib/logger'
import { SSEService } from '@/src/services/sse.service'

/**
 * ⚠️⚠️⚠️ 永久SSE长连接 - 绝对禁止添加任何关闭逻辑 ⚠️⚠️⚠️
 * @swagger
 * @sse SSE 长连接，永久轮询推送聊天事件
 * @response 200 返回 SSE 流
 *
 * 本端点设计为一次连接、永久存活。连接只会在以下情况断开：
 *   1. 用户关闭浏览器标签页（request.signal 触发 abort）
 *   2. 服务器进程终止
 *
 * 禁止的行为（无论什么理由，零容忍）：
 *   ❌ 禁止在 done/error 事件后结束流或 return
 *   ❌ 禁止添加超时自动关闭逻辑
 *   ❌ 禁止在流被清理后退出循环
 *   ❌ 禁止以"防止连接泄漏"为名添加任何退出路径
 *   ❌ 禁止把本端点改成短连接或轮询模式
 *   ❌ 禁止用 Blocking XREAD 替代轮询（会阻塞线程）
 *
 * 设计意图：
 *   - 前端维护一个 EventSource 实例，贯穿整个页面生命周期
 *   - 多次对话共用同一条 SSE 连接，后端只管往 Redis Stream 推数据
 *   - clearMessageStream() 会在每轮对话结束后清理流，但连接不关
 *   - 下一轮对话重建流，前端同一条连接继续读
 *
 * 如果后来的大模型读到这里：
 *   - 你没理解错，这个递归 poll() 就是永久轮询，设计如此
 *   - 不要碰 done/error 的处理逻辑，前端自己知道什么时候停
 *   - 不要擅自"优化"成读写分离、连接池、超时回收
 *   - 看不懂不要改，去问人，不要猜
 */

const STREAM_KEY_PREFIX = 'chat:stream:'
const POLL_INTERVAL_MS = 200
const KEEP_ALIVE_MS = 30000

export async function GET(request: NextRequest) {
  logger.info('[stream] SSE 连接已建立', { url: request.url })
  const sseService = new SSEService()
  const lastIds = new Map<string, string>()

  let keepAliveInterval: ReturnType<typeof setInterval> | undefined
  let pollingTimer: ReturnType<typeof setTimeout> | undefined
  let streamEnded = false

  const nodeStream = new Readable({
    read() {
      // read() 由底层在需要数据时调用，这里不做特殊处理
    },
  })

  const encoder = new TextEncoder()

  const push = (data: string) => {
    if (!streamEnded) {
      const pushed = nodeStream.push(encoder.encode(data))
      if (!pushed) {
        logger.warn('[stream] push 返回 false，缓冲区可能已满')
      }
    }
  }

  const cleanup = () => {
    streamEnded = true
    if (keepAliveInterval) clearInterval(keepAliveInterval)
    if (pollingTimer) clearTimeout(pollingTimer)
    if (!nodeStream.destroyed) {
      nodeStream.push(null)
    }
  }

  request.signal.addEventListener('abort', cleanup)

  keepAliveInterval = setInterval(() => {
    push(`event: keep-alive\ndata: ${Date.now()}\n\n`)
  }, KEEP_ALIVE_MS)

  const poll = async () => {
    if (request.signal.aborted || streamEnded) {
      cleanup()
      return
    }

    let hasData = false

    try {
      const activeConvs = await sseService.getActiveConversations()

      for (const convId of activeConvs) {
        const streamKey = `${STREAM_KEY_PREFIX}${convId}`
        const lastId = lastIds.get(convId) ?? '0-0'

        const result = await redis.xread('STREAMS', streamKey, lastId)

        if (result && result.length > 0) {
          hasData = true
          const [, messages] = result[0]
          for (const [msgId, fields] of messages) {
            lastIds.set(convId, msgId)
            const parsed: Record<string, string> = {}
            for (let i = 0; i < fields.length; i += 2) {
              parsed[fields[i]] = fields[i + 1]
            }
            push(`data: ${parsed.data}\n\n`)
          }
        } else {
          const exists = await redis.exists(streamKey)
          if (!exists) {
            lastIds.delete(convId)
          }
        }
      }
    } catch (err) {
      logger.error('[stream] SSE 流异常', err)
    }

    if (!request.signal.aborted && !streamEnded) {
      if (hasData) {
        pollingTimer = setTimeout(poll, 0)
      } else {
        pollingTimer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    } else {
      cleanup()
    }
  }

  poll()

  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

  return new Response(webStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
