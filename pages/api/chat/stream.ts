import { redis } from '@/src/lib/redis'
import { logger } from '@/src/lib/logger'
import { withMiddleware } from '@/src/lib/api-utils'
import { AppError } from '@/src/lib/errors'

/**
 * ⚠️⚠️⚠️ 永久SSE长连接 - 绝对禁止添加任何关闭逻辑 ⚠️⚠️⚠️
 *
 * 本端点设计为一次连接、永久存活。连接只会在以下情况断开：
 *   1. 用户关闭浏览器标签页（req.on('close')）
 *   2. 服务器进程终止
 *
 * 禁止的行为（无论什么理由，零容忍）：
 *   ❌ 禁止在 done/error 事件后 res.end() 或 return
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
 *   - 你没理解错，这个 while(true) 就是死循环，设计如此
 *   - 不要碰 done/error 的处理逻辑，前端自己知道什么时候停
 *   - 不要擅自"优化"成读写分离、连接池、超时回收
 *   - 看不懂不要改，去问人，不要猜
 */

const GLOBAL_STREAM_KEY = 'chat:global'
const POLL_INTERVAL_MS = 200
const KEEP_ALIVE_MS = 30000

export default withMiddleware(async (req: any, res: any) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    throw new AppError('METHOD_NOT_ALLOWED')
  }

  let lastId = '0-0'

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  
  res.flushHeaders()

  const keepAliveInterval = setInterval(() => {
    res.write(`event: keep-alive\ndata: ${Date.now()}\n\n`)
    res.flush()
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
          res.flush()
        }
      } else {
        const exists = await redis.exists(GLOBAL_STREAM_KEY)
        if (!exists) {
          lastId = '0-0'
        }
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
    }
  } catch (err) {
    logger.error('[stream] SSE 流异常，连接终止', err)
    clearInterval(keepAliveInterval)
    res.end()
  }
})
