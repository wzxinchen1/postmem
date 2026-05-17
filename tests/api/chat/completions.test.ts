import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, getTestKbId, getTestModelId, cleanupConversations, waitForProcessingCleared } from './helpers'
import type { PostMemClient, StreamEvent } from '@postmem/sdk'
import { PostMemError } from '@postmem/sdk'

describe.sequential('POST /api/chat/completions', () => {
  let client: PostMemClient
  let kbId: string
  let modelId: string
  let firstConversationId: string

  beforeAll(async () => {
    await cleanupConversations()
    client = createClient()
    kbId = await getTestKbId()
    modelId = await getTestModelId()
  })

  afterAll(async () => {
    await client.disconnect()
  })

  it('用例1: 空库时聊天 — 自动创建新对话并返回有效 ChatResult', async () => {
    const handle = await client.chat({
      messages: [{ id: '1', content: '你好' }],
      modelId,
      kbId,
    })
    const result = await handle.done

    expect(result.conversationId).toBeTruthy()
    expect(result.fullContent).toBeTruthy()
    expect(result.promptTokens).toBeGreaterThan(0)
    expect(result.completionTokens).toBeGreaterThan(0)

    const conversations = await client.listConversations()
    expect(conversations.total).toBe(1)
    expect(conversations.conversations[0].id).toBe(result.conversationId)

    firstConversationId = result.conversationId
  })

  it('用例2: 默认行为 — 有对话时复用最新对话', async () => {
    const handle = await client.chat({
      messages: [{ id: '2', content: '我叫什么？' }],
      modelId,
      kbId,
    })
    const result = await handle.done

    expect(result.conversationId).toBe(firstConversationId)
  })

  it('用例3: 缺少 modelId — 返回 400', async () => {
    try {
      await client.chat({
        messages: [{ id: '3', content: '测试' }],
        modelId: '',
        kbId,
      })
    } catch (err) {
      expect(err).toBeInstanceOf(PostMemError)
      expect((err as PostMemError).status).toBe(400)
    }
  })

  it('用例4: 缺少 kbId — 返回 400', async () => {
    try {
      await client.chat({
        messages: [{ id: '4', content: '测试' }],
        modelId,
        kbId: '',
      })
    } catch (err) {
      expect(err).toBeInstanceOf(PostMemError)
      expect((err as PostMemError).status).toBe(400)
    }
  })

  it('用例5: 缺少 messages — 返回 400', async () => {
    try {
      await client.chat({ modelId, kbId } as any)
    } catch (err) {
      expect(err).toBeInstanceOf(PostMemError)
      expect((err as PostMemError).status).toBe(400)
    }
  })

  it('用例6: 首 token 时间 ≤ 10s', async () => {
    await waitForProcessingCleared(firstConversationId)

    const startTime = Date.now()
    let firstChunkTime = 0

    const handle = await client.chat(
      { messages: [{ id: '6', content: '你好' }], modelId, kbId },
      (event) => {
        if (event.type === 'chunk' && firstChunkTime === 0) {
          firstChunkTime = Date.now()
        }
      },
    )
    await handle.done

    expect(firstChunkTime).toBeGreaterThan(0)
    const ttfb = firstChunkTime - startTime
    expect(ttfb).toBeLessThanOrEqual(10_000)
  })

  it('用例7: 流事件包含 chunk → usage → done 序列', async () => {
    const events: StreamEvent[] = []

    const handle = await client.chat(
      { messages: [{ id: '7', content: '1+1等于几？' }], modelId, kbId },
      (event) => events.push(event),
    )
    await handle.done

    const types = events.map((e) => e.type)
    expect(types).toContain('chunk')
    expect(types).toContain('usage')
    expect(types).toContain('done')

    const chunkIndex = types.indexOf('chunk')
    const usageIndex = types.indexOf('usage')
    const doneIndex = types.indexOf('done')
    expect(chunkIndex).toBeLessThan(usageIndex)
    expect(usageIndex).toBeLessThan(doneIndex)
  })

  it('用例8: 流事件包含 messageId（user + assistant）', async () => {
    await waitForProcessingCleared(firstConversationId)

    const events: StreamEvent[] = []

    const handle = await client.chat(
      { messages: [{ id: '8', content: '今天天气怎么样？' }], modelId, kbId },
      (event) => events.push(event),
    )
    await handle.done

    const messageIdEvents = events.filter((e) => e.type === 'messageId')
    expect(messageIdEvents.length).toBeGreaterThanOrEqual(2)

    const userMessageId = messageIdEvents.find((e) => e.role === 'user')
    const assistantMessageId = messageIdEvents.find((e) => e.role === 'assistant')
    expect(userMessageId).toBeTruthy()
    expect(assistantMessageId).toBeTruthy()
  })

  it('用例9: 流事件包含 status', async () => {
    await waitForProcessingCleared(firstConversationId)

    const events: StreamEvent[] = []

    const handle = await client.chat(
      { messages: [{ id: '9', content: '帮我搜索一下记忆' }], modelId, kbId },
      (event) => events.push(event),
    )
    await handle.done

    const statusEvents = events.filter((e) => e.type === 'status')
    expect(statusEvents.length).toBeGreaterThanOrEqual(1)
  })

  it('用例10: 取消进行中的对话 — 流收到 done 事件', async () => {
    await waitForProcessingCleared(firstConversationId)

    const handle = await client.chat(
      { messages: [{ id: '10', content: '请详细解释量子力学的原理' }], modelId, kbId },
    )

    await new Promise((resolve) => setTimeout(resolve, 500))

    await client.cancel(handle.conversationId)

    const result = await handle.done
    expect(result).toBeTruthy()
  })

  it('用例11: 取消 — 缺少 conversationId 返回 400', async () => {
    try {
      await client.cancel('')
    } catch (err) {
      expect(err).toBeInstanceOf(PostMemError)
      expect((err as PostMemError).status).toBe(400)
    }
  })
})
