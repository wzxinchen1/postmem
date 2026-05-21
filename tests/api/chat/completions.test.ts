import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createClient,
  getTestKbId,
  getTestModelId,
  cleanupConversations,
  waitForProcessingCleared,
  chatAndWait,
  getBaseUrl,
} from './helpers'
import type { PostMemClient } from '@postmem/sdk'

describe.sequential('POST /api/chat/completions', () => {
  let client: PostMemClient
  let kbId: string
  let modelId: string
  let convId1: string

  beforeAll(async () => {
    await cleanupConversations()
    client = createClient()
    kbId = await getTestKbId()
    modelId = await getTestModelId()
  })

  afterAll(async () => {
    await client.cleanup()
  })

  it('用例1: 空库时聊天 — 自动创建新对话并返回有效 ChatResult', async () => {
    const result = await chatAndWait(
      {
        messages: [{ id: '1', content: '你好' }],
        modelId,
        kbId,
      },
      true,
    )

    expect(result.conversationId).toBeTruthy()
    expect(result.fullContent).toBeTruthy()
    expect(result.error).toBeUndefined()
    expect(result.userTokens).toBeGreaterThan(0)
    expect(result.completionTokens).toBeGreaterThan(0)
    expect(result.totalTokens).toBeGreaterThan(0)

    const conversations = await client.listConversations()
    expect(conversations.total).toBe(1)
    expect(conversations.conversations[0].id).toBe(result.conversationId)

    convId1 = result.conversationId
  })

  it('用例2: 有对话时复用最新对话', async () => {
    const result = await chatAndWait(
      {
        messages: [{ id: '2', content: '我叫什么？' }],
        modelId,
        kbId,
      },
      true,
    )

    expect(result.conversationId).toBe(convId1)
  })

  it('用例3: 传已有 conversationId 继续聊天', async () => {
    const result = await chatAndWait(
      {
        messages: [{ id: '3', content: '继续聊' }],
        modelId,
        kbId,
        conversationId: convId1,
      },
      true,
    )

    expect(result.conversationId).toBe(convId1)
    expect(result.fullContent).toBeTruthy()
  })

  it('用例4: 缺少 modelId — 返回 400', async () => {
    const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: '4', content: '测试' }],
        modelId: '',
        kbId,
      }),
    })

    expect(res.status).toBe(400)
  })

  it('用例5: 缺少 kbId — 返回 400', async () => {
    const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: '5', content: '测试' }],
        modelId,
        kbId: '',
      }),
    })

    expect(res.status).toBe(400)
  })

  it('用例6: 缺少 messages — 返回 400', async () => {
    const res = await fetch(`${getBaseUrl()}/api/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId, kbId }),
    })

    expect(res.status).toBe(400)
  })

  it('用例7: 同一对话正在处理时再次请求 → 400', async () => {
    await waitForProcessingCleared(convId1)

    const firstRes = await fetch(`${getBaseUrl()}/api/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: '7', content: '请详细解释量子力学的原理' }],
        modelId,
        kbId,
        conversationId: convId1,
      }),
    })
    expect(firstRes.ok).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 500))

    const secondRes = await fetch(`${getBaseUrl()}/api/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: '7b', content: '再问一个问题' }],
        modelId,
        kbId,
        conversationId: convId1,
      }),
    })

    expect(secondRes.status).toBe(400)
    const text = await secondRes.text()
    expect(text).toContain('尚未处理完成')

    await waitForProcessingCleared(convId1)
  })

  it('用例8: 首 token 时间 ≤ 10s', async () => {
    const result = await chatAndWait(
      {
        messages: [{ id: '8', content: '你好' }],
        modelId,
        kbId,
        conversationId: convId1,
      },
      true,
    )

    const firstChunk = result.events.find((e) => e.type === 'chunk')
    expect(firstChunk).toBeTruthy()
    const ttfb = (firstChunk!._timestamp ?? 0) - result.requestStartTime
    expect(ttfb).toBeGreaterThan(0)
    expect(ttfb).toBeLessThanOrEqual(10_000)
  })

  it('用例9: 流事件包含 chunk → done 序列（含 token 计数）', async () => {
    const result = await chatAndWait(
      {
        messages: [{ id: '9', content: '1+1等于几？' }],
        modelId,
        kbId,
        conversationId: convId1,
      },
      true,
    )

    const types = result.events.map((e) => e.type)
    expect(types).toContain('chunk')
    expect(types).toContain('done')

    const chunkIndex = types.indexOf('chunk')
    const doneIndex = types.indexOf('done')
    expect(chunkIndex).toBeLessThan(doneIndex)

    const doneEvent = result.events.find((e) => e.type === 'done') as Record<string, unknown> | undefined
    expect(doneEvent).toBeTruthy()
    expect(doneEvent!.error).toBeUndefined()
    expect(doneEvent!.userTokens as number).toBeGreaterThan(0)
    expect(doneEvent!.completionTokens as number).toBeGreaterThan(0)
  })

  it('用例10: 流事件包含 messageId（user + assistant）', async () => {
    const result = await chatAndWait(
      {
        messages: [{ id: '10', content: '今天天气怎么样？' }],
        modelId,
        kbId,
        conversationId: convId1,
      },
      true,
    )

    const messageIdEvents = result.events.filter((e) => e.type === 'messageId')
    expect(messageIdEvents.length).toBeGreaterThanOrEqual(2)

    const userMessageId = messageIdEvents.find((e) => (e as Record<string, unknown>).role === 'user')
    const assistantMessageId = messageIdEvents.find((e) => (e as Record<string, unknown>).role === 'assistant')
    expect(userMessageId).toBeTruthy()
    expect(assistantMessageId).toBeTruthy()
  })

  it('用例11: 流事件包含 status 事件', async () => {
    const result = await chatAndWait(
      {
        messages: [{ id: '11', content: '帮我搜索一下记忆' }],
        modelId,
        kbId,
        conversationId: convId1,
      },
      true,
    )

    const statusEvents = result.events.filter((e) => e.type === 'status')
    expect(statusEvents.length).toBeGreaterThanOrEqual(1)

    const validStatuses: string[] = [
      'searchingWeb',
      'searchingMemory',
      'summarizing',
      'memoryProgress',
      'thinking',
      'recognizing',
      'fetchingUrl',
    ]
    for (const se of statusEvents) {
      expect(validStatuses).toContain((se as Record<string, unknown>).status as string)
    }
  })

  it('用例12: 聊天完成后消息正确保存', async () => {
    await chatAndWait(
      {
        messages: [{ id: '12', content: '测试消息持久化' }],
        modelId,
        kbId,
        conversationId: convId1,
      },
      false,
    )

    const msgResult = await client.getMessages(convId1, { page: 1, limit: 50 })

    const userMsgs = msgResult.messages.filter((m) => m.role === 'user')
    const assistantMsgs = msgResult.messages.filter((m) => m.role === 'assistant')

    expect(assistantMsgs.length).toBeGreaterThan(0)
    expect(assistantMsgs[assistantMsgs.length - 1].content).toBeTruthy()
    expect(userMsgs[userMsgs.length - 1].tokens).toBeGreaterThan(0)
  })

  it('用例13: 重发消息 — 删除后续消息并重新生成', async () => {
    const msgResult = await client.getMessages(convId1, { page: 1, limit: 50 })
    const assistantMsgs = msgResult.messages.filter((m) => m.role === 'assistant')
    const lastAssistantMsg = assistantMsgs[assistantMsgs.length - 1]
    const previousTotal = msgResult.total

    const result = await chatAndWait(
      {
        messages: [],
        modelId,
        kbId,
        conversationId: convId1,
        regenerateMessageId: lastAssistantMsg.id,
      },
      true,
    )

    expect(result.fullContent).toBeTruthy()

    const msgResultAfter = await client.getMessages(convId1, { page: 1, limit: 50 })
    const newAssistantMsgs = msgResultAfter.messages.filter((m) => m.role === 'assistant')
    const newLastAssistant = newAssistantMsgs[newAssistantMsgs.length - 1]

    expect(newLastAssistant.content).toBeTruthy()
    expect(newLastAssistant.id).not.toBe(lastAssistantMsg.id)
    expect(msgResultAfter.total).toBeLessThan(previousTotal)
  })

  it('用例14: 重发后继续聊天 — 新消息追加在重发内容之后', async () => {
    const msgResultBefore = await client.getMessages(convId1, { page: 1, limit: 50 })

    const result = await chatAndWait(
      {
        messages: [{ id: '14', content: '重发后继续聊天' }],
        modelId,
        kbId,
        conversationId: convId1,
      },
      true,
    )

    expect(result.conversationId).toBe(convId1)
    expect(result.fullContent).toBeTruthy()

    const msgResultAfter = await client.getMessages(convId1, { page: 1, limit: 50 })

    expect(msgResultAfter.total).toBeGreaterThan(msgResultBefore.total)

    const lastUserMsg = msgResultAfter.messages.filter((m) => m.role === 'user').slice(-1)[0]
    const lastAssistantMsg = msgResultAfter.messages.filter((m) => m.role === 'assistant').slice(-1)[0]

    expect(lastUserMsg.content).toContain('重发后继续聊天')
    expect(lastAssistantMsg.content).toBeTruthy()
  })
})
